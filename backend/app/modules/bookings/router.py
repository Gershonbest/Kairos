"""Authenticated tenant booking listing and outcome updates."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import AppointmentFormat, Booking, BookingStatus, Client, Service, Tenant
from app.modules.services.helpers import resolve_service_location
from app.schemas.bookings import UpdateBookingStatusRequest

router = APIRouter(dependencies=[Depends(require_active_subscription)])

OUTCOME_STATUSES = {
    BookingStatus.completed,
    BookingStatus.no_show,
    BookingStatus.cancelled,
    BookingStatus.confirmed,
}


def _serialize_booking(booking: Booking, client: Client, service: Service, tenant: Tenant) -> dict:
    return {
        "id": booking.id,
        "status": booking.status.value,
        "start_at": booking.start_at.isoformat() if booking.start_at else None,
        "end_at": booking.end_at.isoformat() if booking.end_at else None,
        "client_id": booking.client_id,
        "service_id": booking.service_id,
        "client_name": client.full_name,
        "client_email": client.email,
        "client_phone": client.phone,
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
    }


@router.get("")
async def list_bookings(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one()
    rows = (
        await session.execute(
            select(Booking, Client, Service)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .where(Booking.tenant_id == current_user.tenant_id)
            .order_by(Booking.start_at.asc())
        )
    ).all()
    return [_serialize_booking(booking, client, service, tenant) for booking, client, service in rows]


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

    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one()
    row = (
        await session.execute(
            select(Booking, Client, Service)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .where(Booking.id == booking_id, Booking.tenant_id == current_user.tenant_id)
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking, client, service = row
    if booking.status == next_status:
        return _serialize_booking(booking, client, service, tenant)

    booking.status = next_status
    booking.version = int(booking.version or 1) + 1
    await session.commit()
    await session.refresh(booking)
    return _serialize_booking(booking, client, service, tenant)
