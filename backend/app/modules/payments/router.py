"""Payment provider connection and transaction listing endpoints."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import Booking, Client, PaymentStatus, PaymentTransaction, Service, WebhookEvent
from app.modules.payments.providers import get_provider, verify_webhook_signature
from app.modules.payments.service import ensure_booking_payment
from app.schemas.payments import PaymentIntentRequest, PaymentIntentResponse

router = APIRouter()


@router.get("/transactions")
async def list_transactions(
    current_user: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    tenant_id = current_user.tenant_id

    # Backfill payment rows for bookings created before deposit recording existed.
    orphan_rows = (
        await session.execute(
            select(Booking, Service)
            .join(Service, Booking.service_id == Service.id)
            .outerjoin(PaymentTransaction, PaymentTransaction.booking_id == Booking.id)
            .where(Booking.tenant_id == tenant_id, PaymentTransaction.id.is_(None))
        )
    ).all()
    for booking, service in orphan_rows:
        await ensure_booking_payment(session, booking, service, booking.idempotency_key)
    if orphan_rows:
        await session.commit()

    rows = (
        await session.execute(
            select(PaymentTransaction, Booking, Client, Service)
            .join(Booking, PaymentTransaction.booking_id == Booking.id)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .where(PaymentTransaction.tenant_id == tenant_id)
            .order_by(PaymentTransaction.created_at.desc())
        )
    ).all()
    return [
        {
            "id": tx.id,
            "provider": tx.provider,
            "provider_reference": tx.provider_reference,
            "status": tx.status.value,
            "amount": float(tx.amount),
            "booking_id": tx.booking_id,
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
            "client_name": client.full_name,
            "service_name": service.name,
            "service_price": float(service.price_amount),
            "deposit_amount": float(service.deposit_amount or 0),
        }
        for tx, _booking, client, service in rows
    ]


@router.post("/intent", response_model=PaymentIntentResponse)
async def create_payment_intent(
    payload: PaymentIntentRequest,
    current_user: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> PaymentIntentResponse:
    booking = (
        await session.execute(
            select(Booking).where(
                Booking.id == payload.booking_id,
                Booking.tenant_id == current_user.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    existing = (
        await session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.tenant_id == current_user.tenant_id,
                PaymentTransaction.idempotency_key == payload.idempotency_key,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return PaymentIntentResponse(
            transaction_id=existing.id,
            provider=existing.provider,
            provider_reference=existing.provider_reference,
            status=existing.status.value,
        )

    provider = get_provider(payload.provider)
    provider_intent = await provider.create_intent(amount=payload.amount, booking_id=payload.booking_id)
    tx = PaymentTransaction(
        tenant_id=current_user.tenant_id or "",
        booking_id=payload.booking_id,
        provider=payload.provider,
        provider_reference=provider_intent.reference,
        status=PaymentStatus.pending,
        amount=payload.amount,
        idempotency_key=payload.idempotency_key,
    )
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return PaymentIntentResponse(
        transaction_id=tx.id,
        provider=tx.provider,
        provider_reference=tx.provider_reference,
        status=tx.status.value,
    )


@router.post("/webhooks/{provider}")
async def receive_webhook(
    provider: str,
    request: Request,
    x_signature: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    body = await request.body()
    if not verify_webhook_signature(body, x_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    payload = await request.json()
    event_id = payload.get("id")
    if not event_id:
        raise HTTPException(status_code=400, detail="Missing event id")

    event = (
        await session.execute(
            select(WebhookEvent).where(WebhookEvent.provider == provider, WebhookEvent.event_id == event_id)
        )
    ).scalar_one_or_none()
    if event:
        return {"ok": True}

    session.add(
        WebhookEvent(
            provider=provider,
            event_id=event_id,
            payload=payload,
            processed=False,
            attempts=0,
            next_attempt_at=datetime.now(UTC),
        )
    )
    await session.commit()
    return {"ok": True}


@router.post("/webhooks/retry-pending")
async def retry_pending_webhooks(session: AsyncSession = Depends(get_db_session)) -> dict[str, int]:
    now = datetime.now(UTC)
    pending = (
        await session.execute(
            select(WebhookEvent).where(
                WebhookEvent.processed.is_(False),
                WebhookEvent.next_attempt_at <= now,
            )
        )
    ).scalars()
    processed = 0
    for event in pending:
        try:
            # Minimal processing contract: mark processed when event includes booking payment success.
            event_type = event.payload.get("type")
            if event_type == "payment.succeeded":
                ref = event.payload.get("data", {}).get("provider_reference")
                tx = (
                    await session.execute(
                        select(PaymentTransaction).where(PaymentTransaction.provider_reference == ref)
                    )
                ).scalar_one_or_none()
                if tx:
                    tx.status = PaymentStatus.succeeded
            event.processed = True
            processed += 1
        except Exception:
            event.attempts += 1
            event.next_attempt_at = now + timedelta(minutes=min(60, 2 ** event.attempts))
    await session.commit()
    return {"processed": processed}
