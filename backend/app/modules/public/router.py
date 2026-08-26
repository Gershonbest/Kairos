"""Unauthenticated public business, availability, and booking endpoints."""

import asyncio
from datetime import UTC, datetime, time, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infra.cache import get_redis, redis_cache
from app.infra.calendar_ics import CalendarEventArgs, calendar_invite_service
from app.infra.db import SessionLocal, get_db_session
from app.infra.models import (
    AppointmentFormat,
    AvailabilityRule,
    Booking,
    BookingStatus,
    CalendarBlock,
    Client,
    Listing,
    ListingStatus,
    PaymentTransaction,
    SchedulingMode,
    Service,
    ServiceBookingType,
    Tenant,
    User,
    UserRole,
)
from app.infra.paystack import PaystackError, paystack_client
from app.modules.clients.names import compose_full_name, profile_display_name, split_person_name, visit_display_name
from app.modules.ai.workspace import workspace
from app.modules.notifications.outbound import queue_booking_confirmations, schedule_booking_reminders
from app.modules.notifications.service import (
    build_booking_receipt_data,
    create_booking_notifications,
    send_booking_confirmation_email,
    send_booking_receipt_from_data,
    send_new_booking_owner_email,
)
from app.modules.notifications.receipt import build_receipt_html
from app.modules.payments.service import (
    apply_successful_paystack_payment,
    booking_payment_amount,
    classify_paystack_status,
    confirm_booking_payment,
    ensure_booking_payment,
    expire_stale_pending_booking_payments,
    initialize_booking_paystack,
    mark_failed_paystack_payment,
)
from app.modules.services.helpers import (
    resolve_appointment_format,
    resolve_service_location,
    service_to_dict,
)
from app.modules.scheduling.service import booking_blocks_slot, generate_slots
from app.modules.tenants.helpers import tenant_display_location

from app.schemas.bookings import BookingOut, PublicBookingCreateRequest

router = APIRouter(prefix="/public")


def _calendar_event_args(booking: Booking, service: Service, tenant: Tenant) -> CalendarEventArgs:
    appointment_format = booking.appointment_format or AppointmentFormat.onsite
    return {
        "booking_id": booking.id,
        "business_name": tenant.name,
        "service_name": service.name,
        "start_at": booking.start_at,
        "end_at": booking.end_at,
        "location": resolve_service_location(service, tenant, appointment_format),
        "host_name": service.host_name,
        "host_title": service.host_title,
        "appointment_format": appointment_format.value,
        "client_instructions": service.client_instructions,
        "online_meeting_link": (
            service.online_meeting_link if appointment_format == AppointmentFormat.online else None
        ),
        "is_all_day": bool(booking.is_all_day),
    }


def _normalize_booking_window(service: Service, requested_start: datetime) -> tuple[datetime, datetime, bool]:
    start = requested_start if requested_start.tzinfo else requested_start.replace(tzinfo=UTC)
    start = start.astimezone(UTC)
    if service.scheduling_mode == SchedulingMode.all_day:
        day_start = datetime.combine(start.date(), time.min, tzinfo=UTC)
        return day_start, day_start + timedelta(days=1), True
    return start, start + timedelta(minutes=service.duration_minutes), False


def _matches_booking_scope(*, service: Service, booking: Booking, selected_listing_id: str | None) -> bool:
    if service.booking_type == ServiceBookingType.listing:
        return booking.listing_id == selected_listing_id
    return booking.listing_id is None and booking.service_id == service.id


def _booking_response(
    booking: Booking,
    service: Service,
    tenant: Tenant,
    payment_tx: PaymentTransaction | None,
    *,
    client: Client | None = None,
    listing: Listing | None = None,
    business_contact_email: str | None = None,
) -> BookingOut:
    amount = booking_payment_amount(service)
    payment_required = bool(tenant.payments_enabled and amount > 0 and tenant.payment_account_id)
    is_confirmed = booking.status == BookingStatus.confirmed
    tenant_key = tenant.public_slug or tenant.id
    appointment_format = booking.appointment_format or AppointmentFormat.onsite
    return BookingOut(
        id=booking.id,
        status=booking.status.value,
        start_at=booking.start_at,
        end_at=booking.end_at,
        client_id=booking.client_id,
        service_id=booking.service_id,
        listing_id=booking.listing_id,
        listing_name=listing.name if listing else None,
        listing_image_url=(listing.image_urls[0] if listing and listing.image_urls else None),
        payment_required=payment_required and (payment_tx is None or payment_tx.status.value == "pending"),
        payment_amount=amount if amount > 0 else None,
        payment_status=payment_tx.status.value if payment_tx else None,
        payment_authorization_url=payment_tx.authorization_url if payment_tx else None,
        payment_access_code=payment_tx.access_code if payment_tx else None,
        payment_reference=payment_tx.provider_reference if payment_tx else None,
        google_calendar_url=(
            calendar_invite_service.build_google_calendar_url(**_calendar_event_args(booking, service, tenant))
            if is_confirmed
            else None
        ),
        ics_download_path=(
            f"/api/v1/public/businesses/{tenant_key}/bookings/{booking.id}/calendar.ics"
            if is_confirmed
            else None
        ),
        receipt_download_path=(
            f"/api/v1/public/businesses/{tenant_key}/bookings/{booking.id}/receipt"
            if is_confirmed
            else None
        ),
        is_all_day=bool(booking.is_all_day),
        scheduling_mode=service.scheduling_mode.value,
        client_name=visit_display_name(booking, client) if client or booking.guest_first_name else None,
        client_first_name=booking.guest_first_name or None,
        client_last_name=booking.guest_last_name or None,
        client_profile_name=profile_display_name(client) or None,
        client_email=client.email if client else None,
        service_name=service.name,
        service_price=float(service.price_amount or 0),
        service_deposit=float(service.deposit_amount or 0),
        service_image_url=service.image_url,
        service_duration_minutes=service.duration_minutes,
        host_name=service.host_name,
        host_title=service.host_title,
        appointment_format=appointment_format.value,
        location=resolve_service_location(service, tenant, appointment_format),
        business_name=tenant.name,
        business_contact_email=business_contact_email,
        business_help_email=tenant.help_email,
        paid_at=payment_tx.paid_at if payment_tx else None,
        payment_currency=payment_tx.currency if payment_tx else None,
        online_meeting_link=(
            service.online_meeting_link if appointment_format == AppointmentFormat.online else None
        ),
    )


async def _owner_contact_email(session: AsyncSession, tenant_id: str) -> str | None:
    owner = (
        await session.execute(
            select(User).where(
                User.tenant_id == tenant_id,
                User.role == UserRole.tenant_admin,
                User.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    return owner.email if owner else None


async def _enriched_booking_response(
    session: AsyncSession,
    booking: Booking,
    service: Service,
    tenant: Tenant,
    payment_tx: PaymentTransaction | None,
    *,
    client: Client | None = None,
    listing: Listing | None = None,
) -> BookingOut:
    if client is None:
        client = (
            await session.execute(select(Client).where(Client.id == booking.client_id))
        ).scalar_one_or_none()
    contact_email = await _owner_contact_email(session, tenant.id)
    if listing is None and booking.listing_id:
        listing = (
            await session.execute(
                select(Listing).where(Listing.id == booking.listing_id, Listing.tenant_id == tenant.id)
            )
        ).scalar_one_or_none()
    return _booking_response(
        booking,
        service,
        tenant,
        payment_tx,
        client=client,
        listing=listing,
        business_contact_email=contact_email,
    )


async def resolve_tenant_key(business_key: str, session: AsyncSession) -> Tenant:
    tenant = (
        await session.execute(
            select(Tenant).where(or_(Tenant.id == business_key, Tenant.public_slug == business_key))
        )
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Business not found")
    return tenant


@router.get("/businesses/{business_id}")
async def get_public_business(business_id: str, session: AsyncSession = Depends(get_db_session)) -> dict:
    tenant = await resolve_tenant_key(business_id, session)
    contact_email = await _owner_contact_email(session, tenant.id)
    return {
        "id": tenant.id,
        "name": tenant.name,
        "business_type": tenant.business_type,
        "location": tenant_display_location(tenant),
        "country_code": tenant.country_code,
        "address_line": tenant.address_line,
        "state": tenant.state,
        "latitude": float(tenant.latitude) if tenant.latitude is not None else None,
        "longitude": float(tenant.longitude) if tenant.longitude is not None else None,
        "branches": tenant.branches or [],
        "public_tagline": tenant.public_tagline,
        "public_description": tenant.public_description,
        "public_logo_url": tenant.public_logo_url,
        "contact_email": contact_email,
        "help_email": tenant.help_email or contact_email,
    }


LOOKUP_RATE_LIMIT = 10
LOOKUP_WINDOW_SECONDS = 60


def _request_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


@router.get("/businesses/{business_id}/clients/lookup")
async def lookup_public_client(
    business_id: str,
    request: Request,
    email: EmailStr = Query(...),
    session: AsyncSession = Depends(get_db_session),
    redis=Depends(get_redis),
) -> dict:
    tenant = await resolve_tenant_key(business_id, session)
    rate_key = f"public-lookup:{_request_ip(request)}"
    try:
        count = int(await redis.incr(rate_key))
        if count == 1:
            await redis.expire(rate_key, LOOKUP_WINDOW_SECONDS)
        if count > LOOKUP_RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Too many lookup attempts. Try again shortly.")
    except HTTPException:
        raise
    except Exception:
        pass

    client = (
        await session.execute(
            select(Client).where(Client.tenant_id == tenant.id, Client.email == str(email).strip().lower())
        )
    ).scalar_one_or_none()
    if not client:
        return {"found": False}

    first_name = (client.first_name or "").strip()
    last_name = (client.last_name or "").strip()
    if not first_name and not last_name:
        first_name, last_name = split_person_name(client.full_name)
    return {
        "found": True,
        "first_name": first_name,
        "last_name": last_name,
        "phone": client.phone,
    }


@router.get("/businesses/{business_id}/services")
async def get_public_services(business_id: str, session: AsyncSession = Depends(get_db_session)) -> list[dict]:
    tenant = await resolve_tenant_key(business_id, session)
    services = (
        await session.execute(
            select(Service)
            .options(selectinload(Service.listings))
            .where(Service.tenant_id == tenant.id, Service.active.is_(True))
        )
    ).scalars()
    return [
        service_to_dict(service, include_meeting_link=False)
        for service in services
    ]


@router.get("/businesses/{business_id}/services/{service_id}/listings")
async def get_public_service_listings(
    business_id: str,
    service_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    tenant = await resolve_tenant_key(business_id, session)
    service = (
        await session.execute(
            select(Service).where(
                Service.id == service_id,
                Service.tenant_id == tenant.id,
                Service.active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    if service.booking_type != ServiceBookingType.listing:
        return []

    rows = (
        await session.execute(
            select(Listing)
            .join(Listing.services)
            .where(
                Service.id == service.id,
                Listing.tenant_id == tenant.id,
                Listing.active.is_(True),
                Listing.status == ListingStatus.available,
            )
            .order_by(Listing.created_at.desc())
        )
    ).scalars().all()
    return [
        {
            "id": listing.id,
            "name": listing.name,
            "description": listing.description,
            "status": listing.status.value,
            "image_urls": listing.image_urls or [],
        }
        for listing in rows
    ]


@router.get("/businesses/{business_id}/availability")
async def get_public_availability(
    business_id: str,
    service_id: str = Query(...),
    listing_id: str | None = Query(default=None),
    from_iso: str = Query(...),
    to_iso: str = Query(...),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant = await resolve_tenant_key(business_id, session)
    if await expire_stale_pending_booking_payments(session, tenant_id=tenant.id):
        await session.commit()
    service = (
        await session.execute(
            select(Service).where(
                Service.id == service_id, Service.tenant_id == tenant.id, Service.active.is_(True)
            )
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    listing: Listing | None = None
    if service.booking_type == ServiceBookingType.listing:
        if not listing_id:
            return {"business_id": business_id, "service_id": service_id, "from": from_iso, "to": to_iso, "slots": []}
        listing = (
            await session.execute(
                select(Listing)
                .join(Listing.services)
                .where(
                    Service.id == service.id,
                    Listing.id == listing_id,
                    Listing.tenant_id == tenant.id,
                    Listing.active.is_(True),
                    Listing.status == ListingStatus.available,
                )
            )
        ).scalar_one_or_none()
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")

    try:
        from_dt = datetime.fromisoformat(from_iso.replace("Z", "+00:00"))
        to_dt = datetime.fromisoformat(to_iso.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date range format") from exc
    if from_dt > to_dt:
        raise HTTPException(status_code=400, detail="Invalid date range")
    if from_dt.tzinfo is None:
        from_dt = from_dt.replace(tzinfo=UTC)
    if to_dt.tzinfo is None:
        to_dt = to_dt.replace(tzinfo=UTC)

    rules = list(
        (
            await session.execute(
                select(AvailabilityRule).where(
                    AvailabilityRule.tenant_id == tenant.id,
                    AvailabilityRule.is_enabled.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )

    booking_filters = [
        Booking.tenant_id == tenant.id,
        Booking.service_id == service.id,
        Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
        Booking.start_at >= from_dt,
        Booking.start_at <= to_dt + timedelta(days=1),
    ]
    if listing:
        booking_filters.append(Booking.listing_id == listing.id)
    else:
        booking_filters.append(Booking.listing_id.is_(None))

    existing_bookings = list(
        (await session.execute(select(Booking).where(*booking_filters))).scalars().all()
    )
    calendar_blocks = list(
        (
            await session.execute(
                select(CalendarBlock).where(
                    CalendarBlock.tenant_id == tenant.id,
                    CalendarBlock.end_date >= from_dt.date(),
                    CalendarBlock.start_date <= to_dt.date(),
                )
            )
        ).scalars().all()
    )

    slots = generate_slots(
        from_dt=from_dt,
        to_dt=to_dt,
        service=service,
        rules=rules,
        existing_bookings=existing_bookings,
        calendar_blocks=calendar_blocks,
    )

    return {"business_id": business_id, "service_id": service_id, "from": from_iso, "to": to_iso, "slots": slots}


@router.get("/businesses/{business_id}/bookings/{booking_id}/calendar.ics")
async def download_booking_calendar_invite(
    business_id: str,
    booking_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    tenant = await resolve_tenant_key(business_id, session)
    booking = (
        await session.execute(
            select(Booking).where(
                Booking.id == booking_id,
                Booking.tenant_id == tenant.id,
                Booking.status == BookingStatus.confirmed,
            )
        )
    ).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Confirmed booking not found")

    service = (
        await session.execute(
            select(Service).where(Service.id == booking.service_id, Service.tenant_id == tenant.id)
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    calendar_invite = calendar_invite_service.build_booking_ics(**_calendar_event_args(booking, service, tenant))
    return Response(
        content=calendar_invite,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="booking-{booking.id}.ics"',
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/businesses/{business_id}/bookings", response_model=BookingOut)
async def create_public_booking(
    business_id: str,
    payload: PublicBookingCreateRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
    redis=Depends(get_redis),
) -> BookingOut:
    tenant = await resolve_tenant_key(business_id, session)
    if await expire_stale_pending_booking_payments(session, tenant_id=tenant.id):
        await session.commit()
    service = (
        await session.execute(
            select(Service).where(
                Service.id == payload.service_id,
                Service.tenant_id == tenant.id,
                Service.active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    listing: Listing | None = None
    if service.booking_type == ServiceBookingType.listing:
        if not payload.listing_id:
            raise HTTPException(status_code=400, detail="Listing selection is required for this service")
        listing = (
            await session.execute(
                select(Listing)
                .join(Listing.services)
                .where(
                    Listing.id == payload.listing_id,
                    Listing.tenant_id == tenant.id,
                    Listing.active.is_(True),
                    Listing.status == ListingStatus.available,
                    Service.id == service.id,
                )
            )
        ).scalar_one_or_none()
        if not listing:
            raise HTTPException(status_code=400, detail="Selected listing is unavailable")
    elif payload.listing_id:
        raise HTTPException(status_code=400, detail="Listing is not supported for this service")

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
                CalendarBlock.tenant_id == tenant.id,
                CalendarBlock.start_date <= start_at.date(),
                CalendarBlock.end_date >= start_at.date(),
            )
        )
    ).scalar_one_or_none()
    if calendar_block:
        raise HTTPException(status_code=409, detail="The business is unavailable on this date")
    buffer_minutes = service.buffer_minutes or 0

    slot_scope = listing.id if listing else "general"
    lock_key = f"slot-lock:{tenant.id}:{payload.service_id}:{slot_scope}:{start_at.isoformat()}"
    locked = await redis.set(lock_key, payload.idempotency_key, ex=30, nx=True)
    if not locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slot is currently being booked")

    existing = (
        await session.execute(
            select(Booking).where(
                Booking.tenant_id == tenant.id,
                Booking.idempotency_key == payload.idempotency_key,
            )
        )
    ).scalar_one_or_none()
    if existing:
        payment_tx = await ensure_booking_payment(session, existing, service, payload.idempotency_key, tenant)
        if (
            payment_tx
            and tenant.payments_enabled
            and tenant.payment_account_id
            and payment_tx.status.value == "pending"
            and not payment_tx.authorization_url
        ):
            client_row = (
                await session.execute(select(Client).where(Client.id == existing.client_id))
            ).scalar_one()
            payment_tx = await initialize_booking_paystack(
                session,
                tenant=tenant,
                booking=existing,
                client=client_row,
                tx=payment_tx,
                business_key=business_id,
            )
        await session.commit()
        existing_listing = listing
        if existing_listing is None and existing.listing_id:
            existing_listing = (
                await session.execute(
                    select(Listing).where(Listing.id == existing.listing_id, Listing.tenant_id == tenant.id)
                )
            ).scalar_one_or_none()
        return await _enriched_booking_response(
            session, existing, service, tenant, payment_tx, listing=existing_listing
        )

    slot_filters = [
        Booking.tenant_id == tenant.id,
        Booking.service_id == service.id,
        Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
        Booking.start_at < end_at + timedelta(minutes=buffer_minutes),
        Booking.end_at > start_at - timedelta(minutes=buffer_minutes),
    ]
    nearby = (await session.execute(select(Booking).where(and_(*slot_filters)))).scalars().all()
    if any(
        _matches_booking_scope(
            service=service,
            booking=row,
            selected_listing_id=listing.id if listing else None,
        )
        and booking_blocks_slot(row, start_at, end_at, buffer_minutes)
        for row in nearby
    ):
        raise HTTPException(status_code=409, detail="Slot already booked")

    client_email = payload.client_email.strip().lower()
    guest_first = (payload.client_first_name or "").strip()[:60]
    guest_last = (payload.client_last_name or "").strip()[:60]
    visit_name = compose_full_name(guest_first, guest_last)
    client = (
        await session.execute(
            select(Client).where(Client.tenant_id == tenant.id, Client.email == client_email)
        )
    ).scalar_one_or_none()
    if not client:
        client = Client(
            tenant_id=tenant.id,
            first_name=guest_first,
            last_name=guest_last,
            full_name=visit_name[:120],
            email=client_email,
            phone=payload.client_phone,
        )
        session.add(client)
        await session.flush()
    else:
        # Returning email: keep the canonical profile; only fill empty phone.
        if not (client.first_name or "").strip() and not (client.last_name or "").strip():
            first_name, last_name = split_person_name(client.full_name)
            client.first_name = first_name
            client.last_name = last_name
        if payload.client_phone and not (client.phone or "").strip():
            client.phone = payload.client_phone
        await session.flush()

    booking = Booking(
        tenant_id=tenant.id,
        client_id=client.id,
        service_id=service.id,
        listing_id=listing.id if listing else None,
        start_at=start_at,
        end_at=end_at,
        is_all_day=is_all_day,
        notes=payload.notes,
        guest_first_name=guest_first,
        guest_last_name=guest_last,
        appointment_format=appointment_format,
        idempotency_key=payload.idempotency_key,
        status=BookingStatus.pending,
    )
    session.add(booking)
    await session.flush()
    payment_tx = await ensure_booking_payment(session, booking, service, payload.idempotency_key, tenant)

    if not tenant.payments_enabled or not tenant.payment_account_id or booking_payment_amount(service) <= 0:
        booking.status = BookingStatus.confirmed
        owner = await create_booking_notifications(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        await schedule_booking_reminders(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        await queue_booking_confirmations(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        await session.commit()
        await session.refresh(booking)
        await redis.delete(lock_key)
        await redis_cache.invalidate_tenant(tenant.id, "bookings:list", "clients:list", "transactions:list", "dashboard:summary")

        appointment_location = resolve_service_location(service, tenant, appointment_format)
        contact_email = await _owner_contact_email(session, tenant.id)
        background_tasks.add_task(
            send_booking_confirmation_email,
            to=client.email,
            client_name=visit_display_name(booking, client),
            business_name=tenant.name,
            service_name=service.name,
            start_at=booking.start_at,
            end_at=booking.end_at,
            location=appointment_location,
            host_name=service.host_name,
            host_title=service.host_title,
            appointment_format=appointment_format.value,
            client_instructions=service.client_instructions,
            online_meeting_link=service.online_meeting_link,
            booking_id=booking.id,
            is_all_day=bool(booking.is_all_day),
            business_logo_url=tenant.public_logo_url,
            business_contact_email=contact_email or tenant.help_email,
            amount_paid=float(payment_tx.amount) if payment_tx and payment_tx.amount is not None else None,
            currency=(payment_tx.currency if payment_tx and payment_tx.currency else "NGN"),
            payment_reference=payment_tx.provider_reference if payment_tx else None,
            payment_status=payment_tx.status.value if payment_tx else None,
            paid_at=payment_tx.paid_at if payment_tx else None,
            service_price=float(service.price_amount) if service.price_amount is not None else None,
            service_deposit=float(service.deposit_amount) if service.deposit_amount is not None else None,
        )
        if owner and owner.email:
            background_tasks.add_task(
                send_new_booking_owner_email,
                to=owner.email,
                owner_name=owner.full_name,
                business_name=tenant.name,
                client_name=visit_display_name(booking, client),
                client_email=client.email,
                service_name=service.name,
                start_at=booking.start_at,
                end_at=booking.end_at,
                appointment_format=appointment_format.value,
                booking_id=booking.id,
            )
        return await _enriched_booking_response(
            session, booking, service, tenant, payment_tx, client=client, listing=listing
        )

    if payment_tx:
        try:
            payment_tx = await initialize_booking_paystack(
                session,
                tenant=tenant,
                booking=booking,
                client=client,
                tx=payment_tx,
                business_key=business_id,
            )
        except (ValueError, PaystackError) as exc:
            raise HTTPException(status_code=502, detail=f"Unable to start payment: {exc}") from exc

    await session.commit()
    await session.refresh(booking)
    if payment_tx:
        await session.refresh(payment_tx)
    await redis.delete(lock_key)
    await redis_cache.invalidate_tenant(tenant.id, "bookings:list", "clients:list", "transactions:list", "dashboard:summary")
    return await _enriched_booking_response(
        session, booking, service, tenant, payment_tx, client=client, listing=listing
    )


@router.post("/businesses/{business_id}/bookings/{booking_id}/confirm-payment", response_model=BookingOut)
async def confirm_public_booking_payment(
    business_id: str,
    booking_id: str,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
    reference: str | None = Query(default=None),
) -> BookingOut:
    tenant = await resolve_tenant_key(business_id, session)
    booking = (
        await session.execute(
            select(Booking).where(Booking.id == booking_id, Booking.tenant_id == tenant.id)
        )
    ).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    service = (
        await session.execute(select(Service).where(Service.id == booking.service_id))
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    payment_tx = (
        await session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.tenant_id == tenant.id,
                PaymentTransaction.booking_id == booking.id,
            )
        )
    ).scalar_one_or_none()
    if not payment_tx:
        raise HTTPException(status_code=400, detail="No payment required for this booking")

    was_pending = booking.status == BookingStatus.pending

    # Paystack path: verify with gateway (webhook may already have confirmed).
    if payment_tx.provider == "paystack":
        ref = reference or payment_tx.provider_reference
        try:
            data = await paystack_client.verify_transaction(ref)
        except PaystackError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if (data.get("status") or "").lower() != "success":
            outcome = classify_paystack_status(data.get("status"))
            if outcome == "failed":
                await mark_failed_paystack_payment(
                    session,
                    reference=ref,
                    gateway_status=str(data.get("status") or ""),
                    source="confirm_public_payment",
                )
                await session.commit()
                raise HTTPException(
                    status_code=400,
                    detail="Payment failed or was cancelled. The time slot has been released — please book again.",
                )
            raise HTTPException(
                status_code=400,
                detail="Payment not completed yet. If you were charged, wait a moment and refresh this page.",
            )
        await apply_successful_paystack_payment(session, reference=ref)
        await session.refresh(booking)
        await session.refresh(payment_tx)
    else:
        # Demo / non-Paystack fallback
        payment_tx = await confirm_booking_payment(session, booking)
        if not payment_tx:
            raise HTTPException(status_code=400, detail="No payment required for this booking")

    client = (
        await session.execute(select(Client).where(Client.id == booking.client_id))
    ).scalar_one()

    newly_confirmed = was_pending and booking.status == BookingStatus.confirmed
    owner = None
    if newly_confirmed:
        owner = await create_booking_notifications(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        await schedule_booking_reminders(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        await queue_booking_confirmations(
            session, tenant=tenant, booking=booking, client=client, service=service
        )

    await session.commit()
    await session.refresh(booking)

    if newly_confirmed:
        await redis_cache.invalidate_tenant(tenant.id, "bookings:list", "clients:list", "transactions:list", "dashboard:summary")
        appointment_format = booking.appointment_format or AppointmentFormat.onsite
        appointment_location = resolve_service_location(service, tenant, appointment_format)
        contact_email = await _owner_contact_email(session, tenant.id)
        background_tasks.add_task(
            send_booking_confirmation_email,
            to=client.email,
            client_name=visit_display_name(booking, client),
            business_name=tenant.name,
            service_name=service.name,
            start_at=booking.start_at,
            end_at=booking.end_at,
            location=appointment_location,
            host_name=service.host_name,
            host_title=service.host_title,
            appointment_format=appointment_format.value,
            client_instructions=service.client_instructions,
            online_meeting_link=service.online_meeting_link,
            booking_id=booking.id,
            is_all_day=bool(booking.is_all_day),
            business_logo_url=tenant.public_logo_url,
            business_contact_email=contact_email or tenant.help_email,
            amount_paid=float(payment_tx.amount) if payment_tx and payment_tx.amount is not None else None,
            currency=(payment_tx.currency if payment_tx and payment_tx.currency else "NGN"),
            payment_reference=payment_tx.provider_reference if payment_tx else None,
            payment_status=payment_tx.status.value if payment_tx else None,
            paid_at=payment_tx.paid_at if payment_tx else None,
            service_price=float(service.price_amount) if service.price_amount is not None else None,
            service_deposit=float(service.deposit_amount) if service.deposit_amount is not None else None,
        )
        if owner and owner.email:
            background_tasks.add_task(
                send_new_booking_owner_email,
                to=owner.email,
                owner_name=owner.full_name,
                business_name=tenant.name,
                client_name=visit_display_name(booking, client),
                client_email=client.email,
                service_name=service.name,
                start_at=booking.start_at,
                end_at=booking.end_at,
                appointment_format=appointment_format.value,
                booking_id=booking.id,
            )

    return await _enriched_booking_response(session, booking, service, tenant, payment_tx, client=client)


async def _load_confirmed_booking_receipt_context(
    session: AsyncSession,
    *,
    business_id: str,
    booking_id: str,
):
    tenant = await resolve_tenant_key(business_id, session)
    booking = (
        await session.execute(
            select(Booking).where(Booking.id == booking_id, Booking.tenant_id == tenant.id)
        )
    ).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != BookingStatus.confirmed:
        raise HTTPException(status_code=400, detail="Receipt is available after the booking is confirmed")

    service = (
        await session.execute(select(Service).where(Service.id == booking.service_id))
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    client = (
        await session.execute(select(Client).where(Client.id == booking.client_id))
    ).scalar_one()
    payment_tx = (
        await session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.tenant_id == tenant.id,
                PaymentTransaction.booking_id == booking.id,
            )
        )
    ).scalar_one_or_none()
    appointment_format = booking.appointment_format or AppointmentFormat.onsite
    location = resolve_service_location(service, tenant, appointment_format)
    contact_email = await _owner_contact_email(session, tenant.id)
    receipt = build_booking_receipt_data(
        tenant=tenant,
        service=service,
        booking=booking,
        client=client,
        payment_tx=payment_tx,
        location=location,
        business_contact_email=contact_email or tenant.help_email,
    )
    return receipt


@router.get("/businesses/{business_id}/bookings/{booking_id}/receipt")
async def download_booking_receipt(
    business_id: str,
    booking_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    receipt = await _load_confirmed_booking_receipt_context(
        session, business_id=business_id, booking_id=booking_id
    )
    html = build_receipt_html(receipt)
    filename = f"receipt-{booking_id[:8]}.html"
    return Response(
        content=html,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/businesses/{business_id}/bookings/{booking_id}/receipt/email")
async def email_booking_receipt(
    business_id: str,
    booking_id: str,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    receipt = await _load_confirmed_booking_receipt_context(
        session, business_id=business_id, booking_id=booking_id
    )
    background_tasks.add_task(send_booking_receipt_from_data, receipt)
    return {"ok": True, "email": receipt.client_email}


class PublicAiChatRequest(BaseModel):
    message: str
    thread_id: str | None = None
    language: str | None = None


@router.post("/businesses/{business_id}/ai/chat")
async def public_ai_chat(
    business_id: str,
    payload: PublicAiChatRequest,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant = await resolve_tenant_key(business_id, session)
    result = await workspace.chat(
        session=session,
        tenant_id=tenant.id,
        message=payload.message,
        agent_key="public_booking",
        audience="external",
        user_id=None,
        thread_id=payload.thread_id,
        language=payload.language,
    )
    return {
        "reply": result.reply,
        "thread_id": result.thread_id,
        "agent": result.agent,
        "status": result.status,
    }


@router.post("/businesses/{business_id}/ai/chat/stream")
async def public_ai_chat_stream(
    business_id: str,
    payload: PublicAiChatRequest,
):
    from fastapi.responses import StreamingResponse

    async with SessionLocal() as session:
        tenant = await resolve_tenant_key(business_id, session)

    async def event_gen():
        try:
            async with SessionLocal() as session:
                async for chunk in workspace.stream_chat(
                    session=session,
                    tenant_id=tenant.id,
                    message=payload.message,
                    agent_key="public_booking",
                    audience="external",
                    thread_id=payload.thread_id,
                    language=payload.language,
                ):
                    yield chunk
        except asyncio.CancelledError:
            raise

    return StreamingResponse(event_gen(), media_type="application/x-ndjson")
