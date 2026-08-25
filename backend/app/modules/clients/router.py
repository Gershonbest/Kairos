"""Tenant client CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.cache import redis_cache
from app.infra.db import get_db_session
from app.infra.models import Booking, Client, ClientEmailTemplate, PaymentStatus, PaymentTransaction, User
from app.modules.clients.client_email import ClientEmailError, render_client_email, send_client_email
from app.modules.clients.email_templates import (
    SYSTEM_TEMPLATES,
    is_system_template_id,
    system_template_id,
)
from app.modules.clients.names import apply_canonical_full_name
from app.modules.clients.communications import list_client_communications, log_client_phone_outreach
from app.schemas.client_communications import ClientCommunicationLogIn, ClientCommunicationOut
from app.schemas.client_emails import (
    ClientEmailPreviewIn,
    ClientEmailPreviewOut,
    ClientEmailSendIn,
    ClientEmailSendOut,
    ClientEmailTemplateCreate,
    ClientEmailTemplateOut,
    ClientEmailTemplateUpdate,
)
from app.schemas.clients import ClientCreate, ClientOut, ClientUpdate

router = APIRouter(dependencies=[Depends(require_active_subscription)])

CLIENTS_CACHE = "clients:list"
BOOKINGS_CACHE = "bookings:list"


async def _client_stats(session: AsyncSession, tenant_id: str, client_ids: list[str]) -> dict[str, dict]:
    if not client_ids:
        return {}

    booking_counts = (
        await session.execute(
            select(Booking.client_id, func.count(Booking.id))
            .where(Booking.tenant_id == tenant_id, Booking.client_id.in_(client_ids))
            .group_by(Booking.client_id)
        )
    ).all()
    last_visits = (
        await session.execute(
            select(Booking.client_id, func.max(Booking.start_at))
            .where(Booking.tenant_id == tenant_id, Booking.client_id.in_(client_ids))
            .group_by(Booking.client_id)
        )
    ).all()
    spent_rows = (
        await session.execute(
            select(Booking.client_id, func.coalesce(func.sum(PaymentTransaction.amount), 0))
            .join(PaymentTransaction, PaymentTransaction.booking_id == Booking.id)
            .where(
                Booking.tenant_id == tenant_id,
                Booking.client_id.in_(client_ids),
                PaymentTransaction.status == PaymentStatus.succeeded,
            )
            .group_by(Booking.client_id)
        )
    ).all()

    stats: dict[str, dict] = {client_id: {"total_bookings": 0, "total_spent": 0.0, "last_visit_at": None} for client_id in client_ids}
    for client_id, count in booking_counts:
        stats[client_id]["total_bookings"] = int(count)
    for client_id, last_visit in last_visits:
        stats[client_id]["last_visit_at"] = last_visit.isoformat() if last_visit else None
    for client_id, spent in spent_rows:
        stats[client_id]["total_spent"] = float(spent or 0)
    return stats


def _client_out(row: Client, stats: dict) -> ClientOut:
    client_stats = stats.get(row.id, {})
    return ClientOut(
        id=row.id,
        full_name=row.full_name,
        email=row.email,
        phone=row.phone,
        notes=row.notes,
        total_bookings=client_stats.get("total_bookings", 0),
        total_spent=client_stats.get("total_spent", 0.0),
        last_visit_at=client_stats.get("last_visit_at"),
    )


@router.get("", response_model=list[ClientOut])
async def list_clients(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ClientOut]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    cache_key = redis_cache.tenant_key(current_user.tenant_id, CLIENTS_CACHE)
    cached = await redis_cache.get_json(cache_key)
    if isinstance(cached, list):
        return [ClientOut.model_validate(item) for item in cached]

    rows = (
        await session.execute(select(Client).where(Client.tenant_id == current_user.tenant_id).order_by(Client.full_name))
    ).scalars().all()
    stats = await _client_stats(session, current_user.tenant_id, [row.id for row in rows])
    payload = [_client_out(row, stats) for row in rows]
    await redis_cache.set_json(cache_key, [item.model_dump(mode="json") for item in payload])
    return payload


def _system_template_outs() -> list[ClientEmailTemplateOut]:
    return [
        ClientEmailTemplateOut(
            id=system_template_id(item.key),
            name=item.name,
            subject=item.subject,
            body=item.body,
            is_system=True,
        )
        for item in SYSTEM_TEMPLATES
    ]


@router.get("/email-templates", response_model=list[ClientEmailTemplateOut])
async def list_client_email_templates(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ClientEmailTemplateOut]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    rows = (
        await session.execute(
            select(ClientEmailTemplate)
            .where(ClientEmailTemplate.tenant_id == current_user.tenant_id)
            .order_by(ClientEmailTemplate.name)
        )
    ).scalars().all()
    custom = [
        ClientEmailTemplateOut(
            id=row.id,
            name=row.name,
            subject=row.subject,
            body=row.body,
            is_system=False,
        )
        for row in rows
    ]
    return _system_template_outs() + custom


@router.post("/email-templates", response_model=ClientEmailTemplateOut, status_code=201)
async def create_client_email_template(
    payload: ClientEmailTemplateCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ClientEmailTemplateOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    row = ClientEmailTemplate(
        tenant_id=current_user.tenant_id,
        name=payload.name.strip(),
        subject=payload.subject.strip(),
        body=payload.body.strip(),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return ClientEmailTemplateOut(
        id=row.id,
        name=row.name,
        subject=row.subject,
        body=row.body,
        is_system=False,
    )


@router.patch("/email-templates/{template_id}", response_model=ClientEmailTemplateOut)
async def update_client_email_template(
    template_id: str,
    payload: ClientEmailTemplateUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ClientEmailTemplateOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    if is_system_template_id(template_id):
        raise HTTPException(status_code=400, detail="Built-in templates cannot be edited")

    row = (
        await session.execute(
            select(ClientEmailTemplate).where(
                ClientEmailTemplate.id == template_id,
                ClientEmailTemplate.tenant_id == current_user.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")

    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.subject is not None:
        row.subject = payload.subject.strip()
    if payload.body is not None:
        row.body = payload.body.strip()

    await session.commit()
    await session.refresh(row)
    return ClientEmailTemplateOut(
        id=row.id,
        name=row.name,
        subject=row.subject,
        body=row.body,
        is_system=False,
    )


@router.delete("/email-templates/{template_id}")
async def delete_client_email_template(
    template_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    if is_system_template_id(template_id):
        raise HTTPException(status_code=400, detail="Built-in templates cannot be deleted")

    row = (
        await session.execute(
            select(ClientEmailTemplate).where(
                ClientEmailTemplate.id == template_id,
                ClientEmailTemplate.tenant_id == current_user.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")

    await session.delete(row)
    await session.commit()
    return {"ok": True}


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ClientOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    client = (
        await session.execute(
            select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
        )
    ).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    stats = await _client_stats(session, current_user.tenant_id, [client.id])
    return _client_out(client, stats)


@router.post("/{client_id}/email/preview", response_model=ClientEmailPreviewOut)
async def preview_client_email(
    client_id: str,
    payload: ClientEmailPreviewIn,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ClientEmailPreviewOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    try:
        subject, body = await render_client_email(
            session,
            tenant_id=current_user.tenant_id,
            client_id=client_id,
            template_id=payload.template_id,
            subject=payload.subject,
            body=payload.body,
        )
    except ClientEmailError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ClientEmailPreviewOut(subject=subject, body=body)


@router.post("/{client_id}/email", response_model=ClientEmailSendOut)
async def send_client_email_message(
    client_id: str,
    payload: ClientEmailSendIn,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ClientEmailSendOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    try:
        message = await send_client_email(
            session,
            tenant_id=current_user.tenant_id,
            client_id=client_id,
            subject=payload.subject,
            body=payload.body,
            actor_user_id=current_user.id,
            template_id=payload.template_id,
        )
        await session.commit()
    except ClientEmailError as exc:
        status = 503 if "not configured" in str(exc).lower() else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc

    return ClientEmailSendOut(ok=True, message=message)


@router.get("/{client_id}/communications", response_model=list[ClientCommunicationOut])
async def get_client_communications(
    client_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ClientCommunicationOut]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    client = (
        await session.execute(
            select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
        )
    ).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    rows = await list_client_communications(
        session,
        tenant_id=current_user.tenant_id,
        client_id=client_id,
    )
    return [ClientCommunicationOut.model_validate(row) for row in rows]


@router.post("/{client_id}/communications", response_model=ClientCommunicationOut, status_code=201)
async def log_client_communication(
    client_id: str,
    payload: ClientCommunicationLogIn,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ClientCommunicationOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    try:
        row = await log_client_phone_outreach(
            session,
            tenant_id=current_user.tenant_id,
            client_id=client_id,
            channel=payload.channel,
            actor_user_id=current_user.id,
            phone=payload.phone,
        )
        await session.commit()
        await session.refresh(row)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    actor_name = (
        await session.execute(select(User.full_name).where(User.id == current_user.id))
    ).scalar_one_or_none()

    return ClientCommunicationOut(
        id=row.id,
        channel=row.channel,  # type: ignore[arg-type]
        status=row.status,
        recipient=row.recipient,
        subject=row.subject,
        summary=row.summary,
        template_id=row.template_id,
        template_name=row.template_name,
        actor_name=actor_name,
        created_at=row.created_at.isoformat(),
    )


@router.post("", response_model=ClientOut, status_code=201)
async def create_client(
    payload: ClientCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ClientOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    existing = (
        await session.execute(
            select(Client).where(Client.tenant_id == current_user.tenant_id, Client.email == payload.email)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="A client with this email already exists")

    client = Client(
        tenant_id=current_user.tenant_id,
        full_name="",
        email=payload.email.lower(),
        phone=payload.phone,
        notes=payload.notes,
    )
    apply_canonical_full_name(client, payload.full_name)
    session.add(client)
    await session.commit()
    await session.refresh(client)
    await redis_cache.invalidate_tenant(current_user.tenant_id, CLIENTS_CACHE)
    return _client_out(client, {client.id: {"total_bookings": 0, "total_spent": 0.0, "last_visit_at": None}})


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: str,
    payload: ClientUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ClientOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    client = (
        await session.execute(
            select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
        )
    ).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if payload.email and payload.email.lower() != client.email:
        conflict = (
            await session.execute(
                select(Client).where(
                    Client.tenant_id == current_user.tenant_id,
                    Client.email == payload.email.lower(),
                    Client.id != client_id,
                )
            )
        ).scalar_one_or_none()
        if conflict:
            raise HTTPException(status_code=409, detail="A client with this email already exists")
        client.email = payload.email.lower()
    if payload.full_name is not None:
        apply_canonical_full_name(client, payload.full_name)
    if payload.phone is not None:
        client.phone = payload.phone
    if payload.notes is not None:
        client.notes = payload.notes

    await session.commit()
    await session.refresh(client)
    await redis_cache.invalidate_tenant(current_user.tenant_id, CLIENTS_CACHE, BOOKINGS_CACHE)
    stats = await _client_stats(session, current_user.tenant_id, [client.id])
    return _client_out(client, stats)


@router.delete("/{client_id}")
async def delete_client(
    client_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    client = (
        await session.execute(
            select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
        )
    ).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    booking_count = (
        await session.execute(
            select(func.count(Booking.id)).where(Booking.client_id == client_id, Booking.tenant_id == current_user.tenant_id)
        )
    ).scalar_one()
    if booking_count:
        raise HTTPException(status_code=409, detail="Cannot delete a client with existing bookings")

    await session.delete(client)
    await session.commit()
    await redis_cache.invalidate_tenant(current_user.tenant_id, CLIENTS_CACHE)
    return {"ok": True}
