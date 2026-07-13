"""Unauthenticated public business, availability, and booking endpoints."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import get_redis
from app.infra.db import get_db_session
from app.infra.models import (
    AppointmentFormat,
    AvailabilityRule,
    Booking,
    BookingStatus,
    Client,
    PaymentTransaction,
    Service,
    Tenant,
)
from app.modules.notifications.service import send_booking_confirmation_email
from app.modules.payments.service import booking_payment_amount, confirm_booking_payment, ensure_booking_payment
from app.modules.services.helpers import (
    resolve_appointment_format,
    resolve_service_location,
    service_to_dict,
)
from app.modules.scheduling.service import generate_slots
from app.modules.tenants.helpers import tenant_display_location

from app.schemas.bookings import BookingOut, PublicBookingCreateRequest

router = APIRouter(prefix="/public")


def _booking_response(
    booking: Booking,
    service: Service,
    tenant: Tenant,
    payment_tx: PaymentTransaction | None,
) -> BookingOut:
    amount = booking_payment_amount(service)
    payment_required = bool(tenant.payments_enabled and amount > 0)
    return BookingOut(
        id=booking.id,
        status=booking.status.value,
        start_at=booking.start_at,
        end_at=booking.end_at,
        client_id=booking.client_id,
        service_id=booking.service_id,
        payment_required=payment_required,
        payment_amount=amount if amount > 0 else None,
        payment_status=payment_tx.status.value if payment_tx else None,
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
    }


@router.get("/businesses/{business_id}/services")
async def get_public_services(business_id: str, session: AsyncSession = Depends(get_db_session)) -> list[dict]:
    tenant = await resolve_tenant_key(business_id, session)
    services = (
        await session.execute(
            select(Service).where(Service.tenant_id == tenant.id, Service.active.is_(True))
        )
    ).scalars()
    return [
        service_to_dict(service, include_meeting_link=False)
        for service in services
    ]


@router.get("/businesses/{business_id}/availability")
async def get_public_availability(
    business_id: str,
    service_id: str = Query(...),
    from_iso: str = Query(...),
    to_iso: str = Query(...),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant = await resolve_tenant_key(business_id, session)
    service = (
        await session.execute(
            select(Service).where(
                Service.id == service_id, Service.tenant_id == tenant.id, Service.active.is_(True)
            )
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

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

    rules = (
        await session.execute(
            select(AvailabilityRule).where(
                AvailabilityRule.tenant_id == tenant.id, AvailabilityRule.is_enabled.is_(True)
            )
        )
    ).scalars().all()

    existing_bookings = (
        await session.execute(
            select(Booking).where(
                Booking.tenant_id == tenant.id,
                Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
                Booking.start_at >= from_dt,
                Booking.start_at <= to_dt + timedelta(days=1),
            )
        )
    ).scalars().all()

    slots = generate_slots(
        from_dt=from_dt,
        to_dt=to_dt,
        service=service,
        rules=rules,
        existing_bookings=existing_bookings,
    )

    return {"business_id": business_id, "service_id": service_id, "from": from_iso, "to": to_iso, "slots": slots}


@router.post("/businesses/{business_id}/bookings", response_model=BookingOut)
async def create_public_booking(
    business_id: str,
    payload: PublicBookingCreateRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
    redis=Depends(get_redis),
) -> BookingOut:
    tenant = await resolve_tenant_key(business_id, session)
    service = (
        await session.execute(
            select(Service).where(Service.id == payload.service_id, Service.tenant_id == tenant.id)
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    try:
        appointment_format = resolve_appointment_format(
            service,
            AppointmentFormat(payload.appointment_format) if payload.appointment_format else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    lock_key = f"slot-lock:{tenant.id}:{payload.service_id}:{payload.start_at.isoformat()}"
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
        await session.commit()
        return _booking_response(existing, service, tenant, payment_tx)

    conflict = (
        await session.execute(
            select(Booking).where(
                and_(
                    Booking.tenant_id == tenant.id,
                    Booking.start_at == payload.start_at,
                    Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
                )
            )
        )
    ).scalar_one_or_none()
    if conflict:
        raise HTTPException(status_code=409, detail="Slot already booked")

    client = (
        await session.execute(
            select(Client).where(Client.tenant_id == tenant.id, Client.email == payload.client_email)
        )
    ).scalar_one_or_none()
    if not client:
        client = Client(
            tenant_id=tenant.id,
            full_name=payload.client_name,
            email=payload.client_email,
            phone=payload.client_phone,
            notes=payload.notes,
        )
        session.add(client)
        await session.flush()

    booking = Booking(
        tenant_id=tenant.id,
        client_id=client.id,
        service_id=service.id,
        start_at=payload.start_at,
        end_at=payload.start_at + timedelta(minutes=service.duration_minutes),
        notes=payload.notes,
        appointment_format=appointment_format,
        idempotency_key=payload.idempotency_key,
        status=BookingStatus.pending,
    )
    session.add(booking)
    await session.flush()
    payment_tx = await ensure_booking_payment(session, booking, service, payload.idempotency_key, tenant)

    if not tenant.payments_enabled or booking_payment_amount(service) <= 0:
        booking.status = BookingStatus.confirmed
        await session.commit()
        await session.refresh(booking)
        await redis.delete(lock_key)

        appointment_location = resolve_service_location(service, tenant, appointment_format)
        background_tasks.add_task(
            send_booking_confirmation_email,
            to=client.email,
            client_name=client.full_name,
            business_name=tenant.name,
            service_name=service.name,
            start_at=booking.start_at,
            end_at=booking.end_at,
            location=appointment_location,
            host_name=service.host_name,
            host_title=service.host_title,
            appointment_format=appointment_format.value,
            client_instructions=service.client_instructions,
            online_meeting_link=service.online_meeting_link if appointment_format == AppointmentFormat.online else None,
            booking_id=booking.id,
        )
        return _booking_response(booking, service, tenant, payment_tx)

    await session.commit()
    await session.refresh(booking)
    await redis.delete(lock_key)
    return _booking_response(booking, service, tenant, payment_tx)


@router.post("/businesses/{business_id}/bookings/{booking_id}/confirm-payment", response_model=BookingOut)
async def confirm_public_booking_payment(
    business_id: str,
    booking_id: str,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
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

    payment_tx = await confirm_booking_payment(session, booking)
    if not payment_tx:
        raise HTTPException(status_code=400, detail="No payment required for this booking")

    client = (
        await session.execute(select(Client).where(Client.id == booking.client_id))
    ).scalar_one()
    await session.commit()
    await session.refresh(booking)

    if booking.status == BookingStatus.confirmed:
        appointment_format = booking.appointment_format or AppointmentFormat.onsite
        appointment_location = resolve_service_location(service, tenant, appointment_format)
        background_tasks.add_task(
            send_booking_confirmation_email,
            to=client.email,
            client_name=client.full_name,
            business_name=tenant.name,
            service_name=service.name,
            start_at=booking.start_at,
            end_at=booking.end_at,
            location=appointment_location,
            host_name=service.host_name,
            host_title=service.host_title,
            appointment_format=appointment_format.value,
            client_instructions=service.client_instructions,
            online_meeting_link=service.online_meeting_link if appointment_format == AppointmentFormat.online else None,
            booking_id=booking.id,
        )

    return _booking_response(booking, service, tenant, payment_tx)
