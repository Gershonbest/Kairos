"""Authenticated tenant booking listing endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import AppointmentFormat, Booking, Client, Service, Tenant
from app.modules.services.helpers import resolve_service_location

router = APIRouter(dependencies=[Depends(require_active_subscription)])


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
    return [
        {
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
        for booking, client, service in rows
    ]
