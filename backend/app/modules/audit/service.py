"""Append-only audit event helpers for admin and money-affecting actions."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser
from app.infra.models import AuditEvent


def request_client_meta(request: Request | None) -> tuple[str | None, str | None]:
    if request is None:
        return None, None
    ip = request.client.host if request.client else None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip() or ip
    user_agent = request.headers.get("user-agent")
    if user_agent and len(user_agent) > 400:
        user_agent = user_agent[:400]
    return ip, user_agent


async def record_audit_event(
    session: AsyncSession,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    tenant_id: str | None = None,
    actor: CurrentUser | None = None,
    actor_user_id: str | None = None,
    actor_role: str | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AuditEvent:
    ip, user_agent = request_client_meta(request)
    event = AuditEvent(
        actor_user_id=actor.id if actor else actor_user_id,
        actor_role=actor.role if actor else actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        tenant_id=tenant_id or (actor.tenant_id if actor else None),
        metadata_json=metadata or {},
        ip=ip,
        user_agent=user_agent,
    )
    session.add(event)
    await session.flush()
    return event
