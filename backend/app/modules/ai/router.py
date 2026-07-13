"""AI assistant chat and suggestion endpoints."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import Booking, Client, Service
from app.modules.scheduling.service import (
    build_scheduling_insights,
    format_insights_reply,
    load_scheduling_context,
)

router = APIRouter(dependencies=[Depends(require_active_subscription)])


class AssistantRequest(BaseModel):
    message: str


@router.post("/assistant")
async def ask_assistant(
    payload: AssistantRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    from_dt = datetime.now(UTC)
    to_dt = from_dt + timedelta(days=14)
    rules, bookings, services = await load_scheduling_context(
        session, current_user.tenant_id, from_dt=from_dt, to_dt=to_dt
    )
    insights = build_scheduling_insights(
        rules=rules,
        bookings=bookings,
        services=services,
        from_dt=from_dt,
        to_dt=to_dt,
    )

    upcoming_rows = (
        await session.execute(
            select(Booking, Client, Service)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .where(
                Booking.tenant_id == current_user.tenant_id,
                Booking.start_at >= from_dt,
                Booking.start_at <= to_dt,
            )
            .order_by(Booking.start_at.asc())
            .limit(8)
        )
    ).all()
    bookings_meta = [
        {
            "client_name": client.full_name,
            "service_name": service.name,
            "start_label": booking.start_at.strftime("%a, %b %d at %I:%M %p").replace(" 0", " "),
        }
        for booking, client, service in upcoming_rows
    ]

    reply, suggestions = format_insights_reply(payload.message, insights, bookings_meta)
    return {"reply": reply, "suggestions": suggestions, "insights": insights}
