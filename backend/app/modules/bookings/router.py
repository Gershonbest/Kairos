"""Authenticated tenant booking listing endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import Booking, Client, Service

router = APIRouter(dependencies=[Depends(require_active_subscription)])


@router.get("")
async def list_bookings(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
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
            "service_name": service.name,
        }
        for booking, client, service in rows
    ]
