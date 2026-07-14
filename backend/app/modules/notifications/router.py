"""Tenant notification preference and inbox endpoints."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user
from app.infra.db import get_db_session
from app.infra.models import Notification

router = APIRouter()


def _notification_payload(row: Notification) -> dict:
    return {
        "id": row.id,
        "type": row.type.value,
        "title": row.title,
        "body": row.body,
        "booking_id": row.booking_id,
        "read_at": row.read_at.isoformat() if row.read_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "is_read": row.read_at is not None,
    }


@router.get("/preferences")
async def get_notification_preferences(
    _: CurrentUser = Depends(get_current_user),
) -> dict:
    return {"email": True, "sms": False}


@router.get("")
async def list_notifications(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=30, ge=1, le=100),
) -> list[dict]:
    rows = (
        await session.execute(
            select(Notification)
            .where(Notification.user_id == current_user.id)
            .order_by(
                asc(Notification.read_at.is_not(None)),
                desc(Notification.created_at),
            )
            .limit(limit)
        )
    ).scalars().all()
    return [_notification_payload(row) for row in rows]


@router.get("/unread-count")
async def unread_notification_count(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    count = (
        await session.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        )
    ).scalar_one()
    return {"count": int(count)}


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    row = (
        await session.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    if row.read_at is None:
        row.read_at = datetime.now(UTC)
        await session.commit()
    return {"ok": True}


@router.post("/read-all")
async def mark_all_notifications_read(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    await session.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return {"ok": True}
