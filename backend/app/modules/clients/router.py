"""Tenant client CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import Booking, Client, PaymentStatus, PaymentTransaction
from app.schemas.clients import ClientCreate, ClientOut, ClientUpdate

router = APIRouter(dependencies=[Depends(require_active_subscription)])


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
    rows = (
        await session.execute(select(Client).where(Client.tenant_id == current_user.tenant_id).order_by(Client.full_name))
    ).scalars().all()
    stats = await _client_stats(session, current_user.tenant_id, [row.id for row in rows])
    return [_client_out(row, stats) for row in rows]


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
        full_name=payload.full_name.strip(),
        email=payload.email.lower(),
        phone=payload.phone,
        notes=payload.notes,
    )
    session.add(client)
    await session.commit()
    await session.refresh(client)
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
        client.full_name = payload.full_name.strip()
    if payload.phone is not None:
        client.phone = payload.phone
    if payload.notes is not None:
        client.notes = payload.notes

    await session.commit()
    await session.refresh(client)
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
    return {"ok": True}
