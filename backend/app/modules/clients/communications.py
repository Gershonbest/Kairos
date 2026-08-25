"""Client manual outreach history helpers."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.models import Client, ClientCommunication, ClientEmailTemplate, User
from app.modules.clients.email_templates import (
    SYSTEM_TEMPLATE_BY_KEY,
    is_system_template_id,
    parse_system_template_key,
)


def truncate_summary(value: str | None, *, limit: int = 500) -> str | None:
    if not value:
        return None
    trimmed = value.strip()
    if len(trimmed) <= limit:
        return trimmed
    return f"{trimmed[: limit - 1].rstrip()}…"


async def resolve_template_name(
    session: AsyncSession,
    *,
    tenant_id: str,
    template_id: str | None,
) -> str | None:
    if not template_id:
        return None
    if is_system_template_id(template_id):
        key = parse_system_template_key(template_id)
        if key and key in SYSTEM_TEMPLATE_BY_KEY:
            return SYSTEM_TEMPLATE_BY_KEY[key].name
        return None

    row = (
        await session.execute(
            select(ClientEmailTemplate.name).where(
                ClientEmailTemplate.id == template_id,
                ClientEmailTemplate.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    return row


async def record_client_communication(
    session: AsyncSession,
    *,
    tenant_id: str,
    client_id: str,
    channel: str,
    recipient: str,
    actor_user_id: str | None = None,
    status: str = "sent",
    subject: str | None = None,
    summary: str | None = None,
    template_id: str | None = None,
    template_name: str | None = None,
) -> ClientCommunication:
    if template_id and not template_name:
        template_name = await resolve_template_name(session, tenant_id=tenant_id, template_id=template_id)

    row = ClientCommunication(
        tenant_id=tenant_id,
        client_id=client_id,
        actor_user_id=actor_user_id,
        channel=channel,
        status=status,
        recipient=recipient,
        subject=subject,
        summary=truncate_summary(summary),
        template_id=template_id,
        template_name=template_name,
    )
    session.add(row)
    await session.flush()
    return row


async def list_client_communications(
    session: AsyncSession,
    *,
    tenant_id: str,
    client_id: str,
    limit: int = 50,
) -> list[dict]:
    rows = (
        await session.execute(
            select(ClientCommunication, User.full_name)
            .outerjoin(User, User.id == ClientCommunication.actor_user_id)
            .where(
                ClientCommunication.tenant_id == tenant_id,
                ClientCommunication.client_id == client_id,
            )
            .order_by(ClientCommunication.created_at.desc())
            .limit(limit)
        )
    ).all()

    return [
        {
            "id": comm.id,
            "channel": comm.channel,
            "status": comm.status,
            "recipient": comm.recipient,
            "subject": comm.subject,
            "summary": comm.summary,
            "template_id": comm.template_id,
            "template_name": comm.template_name,
            "actor_name": actor_name,
            "created_at": comm.created_at.isoformat(),
        }
        for comm, actor_name in rows
    ]


async def log_client_phone_outreach(
    session: AsyncSession,
    *,
    tenant_id: str,
    client_id: str,
    channel: str,
    actor_user_id: str | None,
    phone: str | None = None,
) -> ClientCommunication:
    client = (
        await session.execute(select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not client:
        raise ValueError("Client not found")

    recipient = (phone or client.phone or "").strip()
    if not recipient:
        raise ValueError("Client has no phone number on file")

    summary = "Phone call initiated from dashboard" if channel == "phone_call" else "WhatsApp chat opened from dashboard"
    return await record_client_communication(
        session,
        tenant_id=tenant_id,
        client_id=client_id,
        actor_user_id=actor_user_id,
        channel=channel,
        recipient=recipient,
        status="initiated",
        summary=summary,
    )
