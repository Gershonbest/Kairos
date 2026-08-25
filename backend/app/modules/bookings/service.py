"""Callable booking domain helpers for routers and AI tools."""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.models import (
    AppointmentFormat,
    Booking,
    BookingStatus,
    CalendarBlock,
    Client,
    Listing,
    ListingStatus,
    SchedulingMode,
    Service,
    ServiceBookingType,
    Tenant,
)
from app.modules.clients.names import compose_full_name, split_person_name
from app.modules.notifications.outbound import schedule_booking_reminders, sync_booking_reminders
from app.modules.scheduling.service import booking_blocks_slot
from app.modules.services.helpers import resolve_appointment_format


class BookingServiceError(ValueError):
    pass


def normalize_booking_window(service: Service, start_at: datetime) -> tuple[datetime, datetime, bool]:
    start = start_at if start_at.tzinfo else start_at.replace(tzinfo=UTC)
    if service.scheduling_mode == SchedulingMode.all_day:
        local_date = start.date()
        day_start = datetime.combine(local_date, time.min, tzinfo=UTC)
        day_end = day_start + timedelta(days=1)
        return day_start, day_end, True
    end = start + timedelta(minutes=int(service.duration_minutes or 30))
    return start, end, False


async def get_or_create_client(
    session: AsyncSession,
    *,
    tenant_id: str,
    email: str,
    first_name: str = "",
    last_name: str = "",
    phone: str | None = None,
) -> Client:
    client_email = email.strip().lower()
    if not client_email:
        raise BookingServiceError("Client email is required")
    guest_first = (first_name or "").strip()[:60]
    guest_last = (last_name or "").strip()[:60]
    visit_name = compose_full_name(guest_first, guest_last) or client_email.split("@")[0]
    client = (
        await session.execute(
            select(Client).where(Client.tenant_id == tenant_id, Client.email == client_email)
        )
    ).scalar_one_or_none()
    if not client:
        client = Client(
            tenant_id=tenant_id,
            first_name=guest_first,
            last_name=guest_last,
            full_name=visit_name[:120],
            email=client_email,
            phone=(phone or "").strip() or None,
        )
        session.add(client)
        await session.flush()
        return client
    if not (client.first_name or "").strip() and not (client.last_name or "").strip():
        profile_first, profile_last = split_person_name(client.full_name)
        client.first_name = guest_first or profile_first
        client.last_name = guest_last or profile_last
    if phone and not (client.phone or "").strip():
        client.phone = phone.strip()
    await session.flush()
    return client


async def assert_slot_available(
    session: AsyncSession,
    *,
    tenant: Tenant,
    service: Service,
    start_at: datetime,
    end_at: datetime,
    listing_id: str | None = None,
    ignore_booking_id: str | None = None,
) -> None:
    calendar_block = (
        await session.execute(
            select(CalendarBlock).where(
                CalendarBlock.tenant_id == tenant.id,
                CalendarBlock.start_date <= start_at.date(),
                CalendarBlock.end_date >= start_at.date(),
            )
        )
    ).scalar_one_or_none()
    if calendar_block:
        raise BookingServiceError("The business is unavailable on this date")

    buffer_minutes = service.buffer_minutes or 0
    nearby = (
        await session.execute(
            select(Booking).where(
                Booking.tenant_id == tenant.id,
                Booking.service_id == service.id,
                Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
                Booking.start_at < end_at + timedelta(minutes=buffer_minutes),
                Booking.end_at > start_at - timedelta(minutes=buffer_minutes),
            )
        )
    ).scalars().all()
    for row in nearby:
        if ignore_booking_id and row.id == ignore_booking_id:
            continue
        if listing_id and row.listing_id and row.listing_id != listing_id:
            continue
        if booking_blocks_slot(row, start_at, end_at, buffer_minutes):
            raise BookingServiceError("Slot already booked")


async def create_confirmed_booking(
    session: AsyncSession,
    *,
    tenant: Tenant,
    service: Service,
    client: Client,
    start_at: datetime,
    appointment_format: AppointmentFormat | None = None,
    listing_id: str | None = None,
    notes: str | None = None,
    guest_first_name: str | None = None,
    guest_last_name: str | None = None,
    idempotency_key: str | None = None,
    booking_source: str = "ai",
) -> Booking:
    fmt = resolve_appointment_format(service, appointment_format)
    start, end, is_all_day = normalize_booking_window(service, start_at)
    listing: Listing | None = None
    if service.booking_type == ServiceBookingType.listing:
        if not listing_id:
            raise BookingServiceError("Listing selection is required for this service")
        listing = (
            await session.execute(
                select(Listing).where(
                    Listing.id == listing_id,
                    Listing.tenant_id == tenant.id,
                    Listing.active.is_(True),
                    Listing.status == ListingStatus.available,
                )
            )
        ).scalar_one_or_none()
        if not listing:
            raise BookingServiceError("Selected listing is unavailable")
    elif listing_id:
        raise BookingServiceError("Listing is not supported for this service")

    await assert_slot_available(
        session,
        tenant=tenant,
        service=service,
        start_at=start,
        end_at=end,
        listing_id=listing.id if listing else None,
    )

    booking = Booking(
        tenant_id=tenant.id,
        client_id=client.id,
        service_id=service.id,
        listing_id=listing.id if listing else None,
        start_at=start,
        end_at=end,
        is_all_day=is_all_day,
        notes=(notes or "").strip() or None,
        guest_first_name=(guest_first_name or client.first_name or "").strip()[:60] or None,
        guest_last_name=(guest_last_name or client.last_name or "").strip()[:60] or None,
        booking_source=booking_source,
        appointment_format=fmt,
        idempotency_key=idempotency_key or f"ai-{client.id}-{int(start.timestamp())}",
        status=BookingStatus.confirmed,
    )
    session.add(booking)
    await session.flush()
    await schedule_booking_reminders(
        session, tenant=tenant, booking=booking, client=client, service=service
    )
    return booking


async def cancel_booking(
    session: AsyncSession,
    *,
    tenant_id: str,
    booking_id: str,
    client_email: str | None = None,
) -> Booking:
    booking = (
        await session.execute(
            select(Booking).where(Booking.id == booking_id, Booking.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not booking:
        raise BookingServiceError("Booking not found")
    if client_email:
        client = (
            await session.execute(select(Client).where(Client.id == booking.client_id))
        ).scalar_one()
        if (client.email or "").strip().lower() != client_email.strip().lower():
            raise BookingServiceError("Booking email does not match")
    booking.status = BookingStatus.cancelled
    await sync_booking_reminders(session, booking)
    await session.flush()
    return booking


async def reschedule_booking(
    session: AsyncSession,
    *,
    tenant: Tenant,
    booking_id: str,
    new_start_at: datetime,
    client_email: str | None = None,
) -> Booking:
    booking = (
        await session.execute(
            select(Booking).where(Booking.id == booking_id, Booking.tenant_id == tenant.id)
        )
    ).scalar_one_or_none()
    if not booking:
        raise BookingServiceError("Booking not found")
    client = (
        await session.execute(select(Client).where(Client.id == booking.client_id))
    ).scalar_one()
    if client_email and (client.email or "").strip().lower() != client_email.strip().lower():
        raise BookingServiceError("Booking email does not match")
    if booking.status not in {BookingStatus.confirmed, BookingStatus.pending}:
        raise BookingServiceError("Only pending or confirmed bookings can be rescheduled")

    service = (
        await session.execute(select(Service).where(Service.id == booking.service_id))
    ).scalar_one()
    start, end, is_all_day = normalize_booking_window(service, new_start_at)
    await assert_slot_available(
        session,
        tenant=tenant,
        service=service,
        start_at=start,
        end_at=end,
        listing_id=booking.listing_id,
        ignore_booking_id=booking.id,
    )
    booking.start_at = start
    booking.end_at = end
    booking.is_all_day = is_all_day
    booking.status = BookingStatus.confirmed
    await schedule_booking_reminders(
        session, tenant=tenant, booking=booking, client=client, service=service
    )
    await session.flush()
    return booking
