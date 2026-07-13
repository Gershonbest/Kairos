"""Smart scheduling insights endpoints."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import Booking, Client, Service
from app.modules.scheduling.service import build_scheduling_insights, load_scheduling_context

router = APIRouter(dependencies=[Depends(require_active_subscription)])


@router.get("/insights")
async def get_scheduling_insights(
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
    return build_scheduling_insights(
        rules=rules,
        bookings=bookings,
        services=services,
        from_dt=from_dt,
        to_dt=to_dt,
    )
