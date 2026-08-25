"""Authenticated tenant booking creation, listing, and outcome updates."""

import uuid
from datetime import UTC, datetime, time, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.cache import redis_cache
from app.infra.db import get_db_session
from app.infra.models import (
    AppointmentFormat,
    AvailabilityRule,
    Booking,
    BookingStatus,
    CalendarBlock,
    Client,
    Listing,
    ListingStatus,
    PaymentStatus,
    PaymentTransaction,
    Service,
    ServiceBookingType,
    Tenant,
)
from app.modules.bookings.service import (
    BookingServiceError,
    cancel_booking as cancel_booking_service,
    normalize_booking_window,
    reschedule_booking as reschedule_booking_service,
)
from app.modules.clients.names import compose_full_name, profile_display_name, split_person_name, visit_display_name
from app.modules.notifications.outbound import (
    queue_booking_confirmations,
    schedule_booking_reminders,
    sync_booking_reminders,
)
from app.modules.notifications.service import send_booking_confirmation_email
from app.modules.payments.service import (
    BookingPaymentError,
    BOOKING_LEDGER_PURPOSES,
    booking_payment_amount,
    booking_payment_summary,
    compute_balance_due,
    compute_payment_state,
    record_balance_payment,
    service_total_amount,
    waive_booking_balance,
)
from app.modules.scheduling.service import booking_blocks_slot, generate_slots
from app.modules.services.helpers import resolve_appointment_format, resolve_service_location
from app.schemas.bookings import (
    ManualBookingCreateRequest,
    RecordBalancePaymentRequest,
    RescheduleBookingRequest,
    UpdateBookingStatusRequest,
)

router = APIRouter(dependencies=[Depends(require_active_subscription)])

OUTCOME_STATUSES = {
    BookingStatus.completed,
    BookingStatus.no_show,
    BookingStatus.cancelled,
    BookingStatus.confirmed,
}

BOOKINGS_CACHE = "bookings:list:v2"
CLIENTS_CACHE = "clients:list"


def _payment_summary_sync(
    booking: Booking, service: Service, transactions: list[PaymentTransaction]
) -> dict:
    collected = round(
        sum(float(tx.amount) for tx in transactions if tx.status == PaymentStatus.succeeded),
        2,
    )
    return {
        "service_price": service_total_amount(service),
        "deposit_amount": float(service.deposit_amount or 0),
        "collected_total": collected,
        "balance_due": compute_balance_due(service=service, booking=booking, collected=collected),
        "balance_waived": bool(booking.balance_waived),
        "payment_state": compute_payment_state(service=service, booking=booking, collected=collected),
    }


def _serialize_booking(
    booking: Booking,
    client: Client,
    service: Service,
    tenant: Tenant,
    listing: Listing | None,
    *,
    payment: dict | None = None,
) -> dict:
    payload = {
        "id": booking.id,
        "status": booking.status.value,
        "start_at": booking.start_at.isoformat() if booking.start_at else None,
        "end_at": booking.end_at.isoformat() if booking.end_at else None,
        "client_id": booking.client_id,
        "service_id": booking.service_id,
        "listing_id": booking.listing_id,
        "listing_name": listing.name if listing else None,
        "listing_image_url": (listing.image_urls[0] if listing and listing.image_urls else None),
        "client_name": visit_display_name(booking, client),
        "client_profile_name": profile_display_name(client) or None,
        "client_email": client.email,
        "client_phone": client.phone,
        "booking_source": getattr(booking, "booking_source", "public"),
        "service_name": service.name,
        "service_duration_minutes": service.duration_minutes,
        "scheduling_mode": service.scheduling_mode.value,
        "is_all_day": bool(booking.is_all_day),
        "notes": booking.notes,
        "appointment_format": (
            booking.appointment_format.value if booking.appointment_format else None
        ),
        "host_name": service.host_name,
        "host_title": service.host_title,
        "location": resolve_service_location(
            service,
            tenant,
            booking.appointment_format or AppointmentFormat.onsite,
        ),
        "online_meeting_link": service.online_meeting_link,
    }
    if payment is not None:
        payload["payment"] = payment
    return payload


def _normalize_booking_window(service: Service, requested_start: datetime) -> tuple[datetime, datetime, bool]:
    return normalize_booking_window(service, requested_start)


async def _resolve_listing(
    session: AsyncSession,
    *,
    tenant_id: str,
    service: Service,
    listing_id: str | None,
) -> Listing | None:
    if service.booking_type == ServiceBookingType.listing:
        if not listing_id:
            raise HTTPException(status_code=400, detail="Product selection is required for this service")
        listing = (
            await session.execute(
                select(Listing)
                .join(Listing.services)
                .where(
                    Listing.id == listing_id,
                    Listing.tenant_id == tenant_id,
                    Listing.active.is_(True),
                    Listing.status == ListingStatus.available,
                    Service.id == service.id,
                )
            )
        ).scalar_one_or_none()
        if not listing:
            raise HTTPException(status_code=400, detail="Selected product is unavailable")
        return listing
    if listing_id:
        raise HTTPException(status_code=400, detail="Product selection is not supported for this service")
    return None


async def _available_slots(
    session: AsyncSession,
    *,
    tenant_id: str,
    service: Service,
    listing: Listing | None,
    from_dt: datetime,
    to_dt: datetime,
) -> list[str]:
    rules = list(
        (
            await session.execute(
                select(AvailabilityRule).where(
                    AvailabilityRule.tenant_id == tenant_id,
                    AvailabilityRule.is_enabled.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    filters = [
        Booking.tenant_id == tenant_id,
        Booking.service_id == service.id,
        Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
        Booking.start_at >= from_dt,
        Booking.start_at <= to_dt + timedelta(days=1),
        Booking.listing_id == listing.id if listing else Booking.listing_id.is_(None),
    ]
    existing = list((await session.execute(select(Booking).where(*filters))).scalars().all())
    calendar_blocks = list(
        (
            await session.execute(
                select(CalendarBlock).where(
                    CalendarBlock.tenant_id == tenant_id,
                    CalendarBlock.end_date >= from_dt.date(),
                    CalendarBlock.start_date <= to_dt.date(),
                )
            )
        ).scalars().all()
    )
    return generate_slots(
        from_dt=from_dt,
        to_dt=to_dt,
        service=service,
        rules=rules,
        existing_bookings=existing,
        calendar_blocks=calendar_blocks,
    )


@router.get("/availability")
async def get_manual_booking_availability(
    service_id: str = Query(...),
    from_iso: datetime = Query(...),
    to_iso: datetime = Query(...),
    listing_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    from_dt = from_iso if from_iso.tzinfo else from_iso.replace(tzinfo=UTC)
    to_dt = to_iso if to_iso.tzinfo else to_iso.replace(tzinfo=UTC)
    if from_dt > to_dt:
        raise HTTPException(status_code=400, detail="Invalid date range")
    service = (
        await session.execute(
            select(Service).where(
                Service.id == service_id,
                Service.tenant_id == current_user.tenant_id,
                Service.active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    listing = await _resolve_listing(
        session,
        tenant_id=current_user.tenant_id,
        service=service,
        listing_id=listing_id,
    )
    slots = await _available_slots(
        session,
        tenant_id=current_user.tenant_id,
        service=service,
        listing=listing,
        from_dt=from_dt.astimezone(UTC),
        to_dt=to_dt.astimezone(UTC),
    )
    return {"slots": slots}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_manual_booking(
    payload: ManualBookingCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one()
    if payload.client_id:
        client = (
            await session.execute(
                select(Client).where(
                    Client.id == payload.client_id,
                    Client.tenant_id == current_user.tenant_id,
                )
            )
        ).scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
    else:
        new_email = str(payload.new_client_email).strip().lower()
        client = (
            await session.execute(
                select(Client).where(
                    Client.tenant_id == current_user.tenant_id,
                    Client.email == new_email,
                )
            )
        ).scalar_one_or_none()
        if not client:
            first_name = (payload.new_client_first_name or "").strip()[:60]
            last_name = (payload.new_client_last_name or "").strip()[:60]
            client = Client(
                tenant_id=current_user.tenant_id,
                first_name=first_name,
                last_name=last_name,
                full_name=compose_full_name(first_name, last_name)[:120],
                email=new_email,
                phone=(payload.new_client_phone or "").strip() or None,
            )
            session.add(client)
            await session.flush()
    service = (
        await session.execute(
            select(Service).where(
                Service.id == payload.service_id,
                Service.tenant_id == current_user.tenant_id,
                Service.active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    listing = await _resolve_listing(
        session,
        tenant_id=current_user.tenant_id,
        service=service,
        listing_id=payload.listing_id,
    )
    try:
        appointment_format = resolve_appointment_format(
            service,
            AppointmentFormat(payload.appointment_format) if payload.appointment_format else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    start_at, end_at, is_all_day = _normalize_booking_window(service, payload.start_at)
    calendar_block = (
        await session.execute(
            select(CalendarBlock).where(
                CalendarBlock.tenant_id == current_user.tenant_id,
                CalendarBlock.start_date <= start_at.date(),
                CalendarBlock.end_date >= start_at.date(),
            )
        )
    ).scalar_one_or_none()
    if calendar_block:
        reason = f": {calendar_block.reason}" if calendar_block.reason else ""
        raise HTTPException(status_code=409, detail=f"This date is blocked{reason}")
    if not payload.override_availability:
        day_start = datetime.combine(start_at.date(), time.min, tzinfo=UTC)
        slots = await _available_slots(
            session,
            tenant_id=current_user.tenant_id,
            service=service,
            listing=listing,
            from_dt=day_start,
            to_dt=day_start,
        )
        available = {datetime.fromisoformat(slot.replace("Z", "+00:00")).astimezone(UTC) for slot in slots}
        if start_at not in available:
            raise HTTPException(
                status_code=409,
                detail="That time is outside availability or no longer open. Refresh the slots or use the override.",
            )

    buffer_minutes = service.buffer_minutes or 0
    nearby = (
        await session.execute(
            select(Booking).where(
                and_(
                    Booking.tenant_id == current_user.tenant_id,
                    Booking.service_id == service.id,
                    Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
                    Booking.start_at < end_at + timedelta(minutes=buffer_minutes),
                    Booking.end_at > start_at - timedelta(minutes=buffer_minutes),
                )
            )
        )
    ).scalars().all()
    if any(
        (
            row.listing_id == listing.id
            if service.booking_type == ServiceBookingType.listing and listing
            else row.listing_id is None
        )
        and booking_blocks_slot(row, start_at, end_at, buffer_minutes)
        for row in nearby
    ):
        raise HTTPException(status_code=409, detail="That slot is already booked")

    profile_first, profile_last = split_person_name(client.full_name)
    booking = Booking(
        tenant_id=current_user.tenant_id,
        client_id=client.id,
        service_id=service.id,
        listing_id=listing.id if listing else None,
        start_at=start_at,
        end_at=end_at,
        is_all_day=is_all_day,
        notes=(payload.notes or "").strip() or None,
        guest_first_name=(payload.guest_first_name or client.first_name or profile_first).strip()[:60],
        guest_last_name=(payload.guest_last_name or client.last_name or profile_last).strip()[:60],
        booking_source="dashboard",
        created_by_user_id=current_user.id,
        appointment_format=appointment_format,
        idempotency_key=f"manual-{uuid.uuid4().hex}",
        status=BookingStatus.confirmed,
    )
    session.add(booking)
    await session.flush()

    payment_amount = booking_payment_amount(service)
    if payment_amount > 0:
        now = datetime.now(UTC)
        paid_externally = payload.payment_status == "paid_external"
        session.add(
            PaymentTransaction(
                tenant_id=current_user.tenant_id,
                booking_id=booking.id,
                provider="manual",
                provider_reference=f"manual-{booking.id}",
                status=PaymentStatus.succeeded if paid_externally else PaymentStatus.pending,
                amount=payment_amount,
                currency="NGN",
                purpose="booking",
                paid_at=now if paid_externally else None,
                idempotency_key=f"manual-pay-{booking.id}",
            )
        )

    await schedule_booking_reminders(
        session, tenant=tenant, booking=booking, client=client, service=service
    )
    if payload.send_confirmation:
        await queue_booking_confirmations(
            session, tenant=tenant, booking=booking, client=client, service=service
        )

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="That slot was just booked") from exc
    await session.refresh(booking)
    await redis_cache.invalidate_tenant(
        current_user.tenant_id,
        BOOKINGS_CACHE,
        CLIENTS_CACHE,
        "transactions:list",
        "dashboard:summary",
    )

    if payload.send_confirmation:
        location = resolve_service_location(service, tenant, appointment_format)
        background_tasks.add_task(
            send_booking_confirmation_email,
            to=client.email,
            client_name=visit_display_name(booking, client),
            business_name=tenant.name,
            service_name=service.name,
            start_at=booking.start_at,
            end_at=booking.end_at,
            location=location,
            host_name=service.host_name,
            host_title=service.host_title,
            appointment_format=appointment_format.value,
            client_instructions=service.client_instructions,
            online_meeting_link=service.online_meeting_link,
            booking_id=booking.id,
            is_all_day=bool(booking.is_all_day),
            business_logo_url=tenant.public_logo_url,
            business_contact_email=tenant.help_email,
            amount_paid=(
                booking_payment_amount(service)
                if payload.payment_status == "paid_external"
                else None
            ),
            currency="NGN",
            payment_status=(
                PaymentStatus.succeeded.value
                if payload.payment_status == "paid_external"
                else None
            ),
            paid_at=datetime.now(UTC) if payload.payment_status == "paid_external" else None,
            service_price=float(service.price_amount or 0),
            service_deposit=float(service.deposit_amount or 0),
        )
    return _serialize_booking(booking, client, service, tenant, listing)


@router.get("")
async def list_bookings(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    cache_key = redis_cache.tenant_key(current_user.tenant_id, BOOKINGS_CACHE)
    cached = await redis_cache.get_json(cache_key)
    if isinstance(cached, list):
        return cached

    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one()
    rows = (
        await session.execute(
            select(Booking, Client, Service, Listing)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .join(Listing, Booking.listing_id == Listing.id, isouter=True)
            .where(Booking.tenant_id == current_user.tenant_id)
            .order_by(Booking.start_at.asc())
        )
    ).all()
    booking_ids = [booking.id for booking, _, _, _ in rows]
    tx_map: dict[str, list[PaymentTransaction]] = {booking_id: [] for booking_id in booking_ids}
    if booking_ids:
        tx_rows = (
            await session.execute(
                select(PaymentTransaction).where(
                    PaymentTransaction.booking_id.in_(booking_ids),
                    PaymentTransaction.purpose.in_(tuple(BOOKING_LEDGER_PURPOSES)),
                )
            )
        ).scalars().all()
        for tx in tx_rows:
            if tx.booking_id:
                tx_map.setdefault(tx.booking_id, []).append(tx)
    payload = [
        _serialize_booking(
            booking,
            client,
            service,
            tenant,
            listing,
            payment=_payment_summary_sync(booking, service, tx_map.get(booking.id, [])),
        )
        for booking, client, service, listing in rows
    ]
    await redis_cache.set_json(cache_key, payload)
    return payload


@router.patch("/{booking_id}")
async def update_booking_status(
    booking_id: str,
    payload: UpdateBookingStatusRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Record appointment outcome: completed, no-show, cancelled, or re-confirmed."""
    try:
        next_status = BookingStatus(payload.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid booking status") from exc

    if next_status not in OUTCOME_STATUSES:
        raise HTTPException(status_code=400, detail="Status is not allowed")

    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one()
    row = (
        await session.execute(
            select(Booking, Client, Service, Listing)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .join(Listing, Booking.listing_id == Listing.id, isouter=True)
            .where(Booking.id == booking_id, Booking.tenant_id == current_user.tenant_id)
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking, client, service, listing = row
    payment = await booking_payment_summary(session, booking=booking, service=service)
    if booking.status == next_status:
        return _serialize_booking(booking, client, service, tenant, listing, payment=payment)

    if next_status == BookingStatus.cancelled:
        try:
            booking = await cancel_booking_service(
                session,
                tenant_id=current_user.tenant_id,
                booking_id=booking_id,
            )
        except BookingServiceError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        booking.version = int(booking.version or 1) + 1
    else:
        booking.status = next_status
        booking.version = int(booking.version or 1) + 1
        await sync_booking_reminders(session, booking)

    await session.commit()
    await session.refresh(booking)
    await redis_cache.invalidate_tenant(current_user.tenant_id, BOOKINGS_CACHE, CLIENTS_CACHE, "transactions:list", "dashboard:summary")
    payment = await booking_payment_summary(session, booking=booking, service=service)
    return _serialize_booking(booking, client, service, tenant, listing, payment=payment)


@router.post("/{booking_id}/record-balance")
async def record_booking_balance(
    booking_id: str,
    payload: RecordBalancePaymentRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    row = (
        await session.execute(
            select(Booking, Client, Service, Listing, Tenant)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .join(Tenant, Booking.tenant_id == Tenant.id)
            .join(Listing, Booking.listing_id == Listing.id, isouter=True)
            .where(Booking.id == booking_id, Booking.tenant_id == current_user.tenant_id)
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking, client, service, listing, tenant = row
    try:
        await record_balance_payment(
            session,
            tenant_id=current_user.tenant_id,
            booking=booking,
            service=service,
            amount=payload.amount,
            method=payload.method,
            paid_at=payload.paid_at,
            notes=payload.notes,
        )
        if booking.status == BookingStatus.confirmed:
            booking.status = BookingStatus.completed
        await session.commit()
    except BookingPaymentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(booking)
    await redis_cache.invalidate_tenant(
        current_user.tenant_id,
        BOOKINGS_CACHE,
        CLIENTS_CACHE,
        "transactions:list",
        "dashboard:summary",
    )
    payment = await booking_payment_summary(session, booking=booking, service=service)
    return _serialize_booking(booking, client, service, tenant, listing, payment=payment)


@router.post("/{booking_id}/waive-balance")
async def waive_booking_balance_endpoint(
    booking_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    row = (
        await session.execute(
            select(Booking, Client, Service, Listing, Tenant)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .join(Tenant, Booking.tenant_id == Tenant.id)
            .join(Listing, Booking.listing_id == Listing.id, isouter=True)
            .where(Booking.id == booking_id, Booking.tenant_id == current_user.tenant_id)
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking, client, service, listing, tenant = row
    try:
        await waive_booking_balance(
            session,
            tenant_id=current_user.tenant_id,
            booking=booking,
            service=service,
        )
        await session.commit()
    except BookingPaymentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(booking)
    await redis_cache.invalidate_tenant(
        current_user.tenant_id,
        BOOKINGS_CACHE,
        CLIENTS_CACHE,
        "transactions:list",
        "dashboard:summary",
    )
    payment = await booking_payment_summary(session, booking=booking, service=service)
    return _serialize_booking(booking, client, service, tenant, listing, payment=payment)


@router.post("/{booking_id}/reschedule")
async def reschedule_booking(
    booking_id: str,
    payload: RescheduleBookingRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one()
    try:
        booking = await reschedule_booking_service(
            session,
            tenant=tenant,
            booking_id=booking_id,
            new_start_at=payload.start_at,
        )
        service = (
            await session.execute(select(Service).where(Service.id == booking.service_id))
        ).scalar_one()
        client = (
            await session.execute(select(Client).where(Client.id == booking.client_id))
        ).scalar_one()
    except BookingServiceError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await session.commit()
    row = (
        await session.execute(
            select(Booking, Client, Service, Listing)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .join(Listing, Booking.listing_id == Listing.id, isouter=True)
            .where(Booking.id == booking.id)
        )
    ).one()
    booking, client, service, listing = row
    await redis_cache.invalidate_tenant(
        current_user.tenant_id, BOOKINGS_CACHE, CLIENTS_CACHE, "transactions:list", "dashboard:summary"
    )
    payment = await booking_payment_summary(session, booking=booking, service=service)
    return _serialize_booking(booking, client, service, tenant, listing, payment=payment)
