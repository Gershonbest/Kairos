"""Send templated emails from a tenant to a client."""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.infra.email import EmailDeliveryError, email_service
from app.infra.models import Client, ClientEmailTemplate, Tenant
from app.modules.clients.communications import record_client_communication, truncate_summary
from app.modules.clients.email_templates import (
    SYSTEM_TEMPLATE_BY_KEY,
    build_template_context,
    is_system_template_id,
    parse_system_template_key,
    render_template_text,
    wrap_client_email_html,
)

logger = structlog.get_logger()


class ClientEmailError(Exception):
    """Raised when a client email cannot be prepared or sent."""


async def load_tenant_client(
    session: AsyncSession, *, tenant_id: str, client_id: str
) -> tuple[Tenant, Client]:
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise ClientEmailError("Tenant not found")

    client = (
        await session.execute(select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not client:
        raise ClientEmailError("Client not found")

    return tenant, client


async def resolve_template_content(
    session: AsyncSession,
    *,
    tenant_id: str,
    template_id: str | None,
    subject: str | None,
    body: str | None,
) -> tuple[str, str]:
    if template_id:
        if is_system_template_id(template_id):
            key = parse_system_template_key(template_id)
            if not key or key not in SYSTEM_TEMPLATE_BY_KEY:
                raise ClientEmailError("Template not found")
            definition = SYSTEM_TEMPLATE_BY_KEY[key]
            return definition.subject, definition.body

        row = (
            await session.execute(
                select(ClientEmailTemplate).where(
                    ClientEmailTemplate.id == template_id,
                    ClientEmailTemplate.tenant_id == tenant_id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise ClientEmailError("Template not found")
        return row.subject, row.body

    if subject and body:
        return subject, body

    raise ClientEmailError("Provide a template or both subject and body")


async def render_client_email(
    session: AsyncSession,
    *,
    tenant_id: str,
    client_id: str,
    template_id: str | None = None,
    subject: str | None = None,
    body: str | None = None,
) -> tuple[str, str]:
    tenant, client = await load_tenant_client(session, tenant_id=tenant_id, client_id=client_id)
    raw_subject, raw_body = await resolve_template_content(
        session,
        tenant_id=tenant_id,
        template_id=template_id,
        subject=subject,
        body=body,
    )
    context = build_template_context(tenant=tenant, client=client)
    return render_template_text(raw_subject, context), render_template_text(raw_body, context)


async def send_client_email(
    session: AsyncSession,
    *,
    tenant_id: str,
    client_id: str,
    subject: str,
    body: str,
    actor_user_id: str | None = None,
    template_id: str | None = None,
) -> str:
    settings = get_settings()
    if not email_service.is_configured() and settings.app_env != "dev":
        raise ClientEmailError("Email delivery is not configured for this workspace")

    tenant, client = await load_tenant_client(session, tenant_id=tenant_id, client_id=client_id)
    context = build_template_context(tenant=tenant, client=client)
    rendered_subject = render_template_text(subject, context)
    rendered_body = render_template_text(body, context)
    html_body = wrap_client_email_html(
        business_name=tenant.name,
        body=rendered_body,
        business_logo_url=tenant.public_logo_url,
    )

    try:
        email_service.send(
            to=client.email,
            subject=rendered_subject,
            html_body=html_body,
            text_body=rendered_body,
        )
    except EmailDeliveryError as exc:
        logger.exception("clients.email_send_failed", tenant_id=tenant_id, client_id=client_id)
        raise ClientEmailError("Unable to send email right now. Try again shortly.") from exc

    await record_client_communication(
        session,
        tenant_id=tenant_id,
        client_id=client_id,
        actor_user_id=actor_user_id,
        channel="email",
        recipient=client.email,
        status="sent",
        subject=rendered_subject,
        summary=truncate_summary(rendered_body),
        template_id=template_id,
    )

    if not email_service.is_configured():
        return "Email logged in development (no mail provider configured)."
    return f"Email sent to {client.email}."
