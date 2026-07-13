"""Tenant weekly availability rules endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import AvailabilityRule
from app.schemas.availability import AvailabilityRulesReplaceRequest

router = APIRouter(dependencies=[Depends(require_active_subscription)])


@router.get("")
async def list_rules(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")
    rows = (
        await session.execute(select(AvailabilityRule).where(AvailabilityRule.tenant_id == current_user.tenant_id))
    ).scalars()
    return [
        {
            "id": row.id,
            "day_of_week": row.day_of_week,
            "start_time": row.start_time,
            "end_time": row.end_time,
            "is_enabled": row.is_enabled,
        }
        for row in rows
    ]


@router.put("")
async def replace_rules(
    payload: AvailabilityRulesReplaceRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")
    await session.execute(delete(AvailabilityRule).where(AvailabilityRule.tenant_id == current_user.tenant_id))
    for rule in payload.rules:
        session.add(
            AvailabilityRule(
                tenant_id=current_user.tenant_id,
                day_of_week=rule.day_of_week,
                start_time=rule.start_time,
                end_time=rule.end_time,
                is_enabled=rule.is_enabled,
            )
        )
    await session.commit()
    return {"ok": True}
