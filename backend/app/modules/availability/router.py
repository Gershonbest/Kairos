"""Tenant weekly availability and calendar block endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.cache import redis_cache
from app.infra.db import get_db_session
from app.infra.models import AvailabilityRule, CalendarBlock
from app.schemas.availability import AvailabilityRulesReplaceRequest, CalendarBlockCreateRequest

router = APIRouter(dependencies=[Depends(require_active_subscription)])

AVAILABILITY_CACHE = "availability:list"


def _serialize_block(block: CalendarBlock) -> dict:
    return {
        "id": block.id,
        "start_date": block.start_date.isoformat(),
        "end_date": block.end_date.isoformat(),
        "reason": block.reason,
        "created_at": block.created_at.isoformat() if block.created_at else None,
    }


@router.get("/blocks")
async def list_calendar_blocks(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")
    rows = (
        await session.execute(
            select(CalendarBlock)
            .where(CalendarBlock.tenant_id == current_user.tenant_id)
            .order_by(CalendarBlock.start_date.asc())
        )
    ).scalars().all()
    return [_serialize_block(row) for row in rows]


@router.post("/blocks", status_code=status.HTTP_201_CREATED)
async def create_calendar_block(
    payload: CalendarBlockCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")
    block = CalendarBlock(
        tenant_id=current_user.tenant_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=(payload.reason or "").strip() or None,
        created_by_user_id=current_user.id,
    )
    session.add(block)
    await session.commit()
    await session.refresh(block)
    await redis_cache.invalidate_tenant(
        current_user.tenant_id,
        AVAILABILITY_CACHE,
        "bookings:list",
        "dashboard:summary",
    )
    return _serialize_block(block)


@router.delete("/blocks/{block_id}")
async def delete_calendar_block(
    block_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")
    block = (
        await session.execute(
            select(CalendarBlock).where(
                CalendarBlock.id == block_id,
                CalendarBlock.tenant_id == current_user.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Calendar block not found")
    await session.delete(block)
    await session.commit()
    await redis_cache.invalidate_tenant(
        current_user.tenant_id,
        AVAILABILITY_CACHE,
        "bookings:list",
        "dashboard:summary",
    )
    return {"ok": True}


@router.get("")
async def list_rules(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")

    cache_key = redis_cache.tenant_key(current_user.tenant_id, AVAILABILITY_CACHE)
    cached = await redis_cache.get_json(cache_key)
    if isinstance(cached, list):
        return cached

    rows = (
        await session.execute(select(AvailabilityRule).where(AvailabilityRule.tenant_id == current_user.tenant_id))
    ).scalars()
    payload = [
        {
            "id": row.id,
            "day_of_week": row.day_of_week,
            "start_time": row.start_time,
            "end_time": row.end_time,
            "is_enabled": row.is_enabled,
        }
        for row in rows
    ]
    await redis_cache.set_json(cache_key, payload)
    return payload


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
    await redis_cache.invalidate_tenant(current_user.tenant_id, AVAILABILITY_CACHE)
    return {"ok": True}
