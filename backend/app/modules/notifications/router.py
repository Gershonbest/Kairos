"""Tenant notification preference and inbox endpoints."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import asc, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import CurrentUser, get_current_user
from app.infra.db import get_db_session
from app.infra.models import Notification, NotificationPreference
from app.modules.notifications.outbound import (
    DEFAULT_CHANNEL_OFFSETS,
    normalize_channel_offsets,
    process_due_messages,
    reschedule_tenant_upcoming_reminders,
)
from app.schemas.tenants import NotificationPreferencesUpdate

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


def _prefs_payload(row: NotificationPreference) -> dict:
    offsets = normalize_channel_offsets(row.reminder_offsets_minutes)
    return {
        "email_enabled": row.email_enabled,
        "booking_created_email": row.booking_created_email,
        "payment_received_email": row.payment_received_email,
        "sms_enabled": row.sms_enabled,
        "client_reminder_email": row.client_reminder_email,
        "client_reminder_sms": row.client_reminder_sms or row.sms_enabled,
        "client_reminder_whatsapp": row.client_reminder_whatsapp,
        "client_reminder_voice": row.client_reminder_voice,
        "reminder_offsets_minutes": offsets,
        # Back-compat: first email offsets for older clients.
        "reminder_offsets_minutes_flat": list(offsets.get("email") or DEFAULT_CHANNEL_OFFSETS["email"]),
        "email": row.email_enabled,
        "sms": row.sms_enabled,
    }


async def _get_or_create_prefs(session: AsyncSession, tenant_id: str) -> NotificationPreference:
    prefs = (
        await session.execute(
            select(NotificationPreference).where(NotificationPreference.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if prefs:
        return prefs
    prefs = NotificationPreference(tenant_id=tenant_id)
    session.add(prefs)
    await session.flush()
    return prefs


@router.get("/preferences")
async def get_notification_preferences(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    prefs = await _get_or_create_prefs(session, current_user.tenant_id)
    await session.commit()
    return _prefs_payload(prefs)


@router.put("/preferences")
async def update_notification_preferences(
    payload: NotificationPreferencesUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    prefs = await _get_or_create_prefs(session, current_user.tenant_id)
    data = payload.model_dump(exclude_unset=True)
    if "email_enabled" in data and data["email_enabled"] is not None:
        prefs.email_enabled = data["email_enabled"]
    if "booking_created_email" in data and data["booking_created_email"] is not None:
        prefs.booking_created_email = data["booking_created_email"]
    if "payment_received_email" in data and data["payment_received_email"] is not None:
        prefs.payment_received_email = data["payment_received_email"]
    if "sms_enabled" in data and data["sms_enabled"] is not None:
        prefs.sms_enabled = data["sms_enabled"]
        if "client_reminder_sms" not in data:
            prefs.client_reminder_sms = data["sms_enabled"]
    if "client_reminder_email" in data and data["client_reminder_email"] is not None:
        prefs.client_reminder_email = data["client_reminder_email"]
    if "client_reminder_sms" in data and data["client_reminder_sms"] is not None:
        prefs.client_reminder_sms = data["client_reminder_sms"]
        prefs.sms_enabled = data["client_reminder_sms"]
    if "client_reminder_whatsapp" in data and data["client_reminder_whatsapp"] is not None:
        prefs.client_reminder_whatsapp = data["client_reminder_whatsapp"]
    if "client_reminder_voice" in data and data["client_reminder_voice"] is not None:
        prefs.client_reminder_voice = data["client_reminder_voice"]
    if "reminder_offsets_minutes" in data and data["reminder_offsets_minutes"] is not None:
        prefs.reminder_offsets_minutes = normalize_channel_offsets(data["reminder_offsets_minutes"])
    prefs.updated_at = datetime.now(UTC)
    await reschedule_tenant_upcoming_reminders(session, current_user.tenant_id)
    await session.commit()
    await session.refresh(prefs)
    return _prefs_payload(prefs)


@router.post("/reminders/run-once")
async def run_reminders_once(
    session: AsyncSession = Depends(get_db_session),
    x_job_token: str | None = Header(default=None, alias="X-Job-Token"),
) -> dict:
    settings = get_settings()
    expected = (settings.outbound_job_token or "").strip()
    if not expected or x_job_token != expected:
        raise HTTPException(status_code=403, detail="Forbidden")
    return await process_due_messages(session, acquire_lock=True)


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
