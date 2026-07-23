"""Payment provider connection and transaction listing endpoints."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import CurrentUser, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import (
    AppointmentFormat,
    Booking,
    Client,
    PaymentStatus,
    PaymentTransaction,
    Service,
    Tenant,
    WebhookEvent,
)
from app.infra.paystack import PaystackError, paystack_client
from app.modules.notifications.service import (
    create_booking_notifications,
    send_booking_confirmation_email,
    send_new_booking_owner_email,
)
from app.modules.payments.providers import get_provider, verify_paystack_signature, verify_webhook_signature
from app.modules.payments.service import apply_successful_paystack_payment, ensure_booking_payment
from app.modules.services.helpers import resolve_service_location
from app.schemas.payments import PaymentIntentRequest, PaymentIntentResponse

router = APIRouter()
settings = get_settings()


@router.get("/config")
async def payment_public_config() -> dict:
    return {
        "provider": "paystack",
        "public_key": settings.paystack_public_key,
        "platform_fee_percent": float(settings.paystack_platform_fee_percent),
        "configured": paystack_client.is_configured(),
    }


@router.get("/transactions")
async def list_transactions(
    current_user: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    tenant_id = current_user.tenant_id

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
            .outerjoin(Booking, PaymentTransaction.booking_id == Booking.id)
            .outerjoin(Client, Booking.client_id == Client.id)
            .outerjoin(Service, Booking.service_id == Service.id)
            .where(PaymentTransaction.tenant_id == tenant_id, PaymentTransaction.purpose == "booking")
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
            "currency": tx.currency,
            "platform_fee_amount": float(tx.platform_fee_amount) if tx.platform_fee_amount is not None else None,
            "tenant_settlement_amount": float(tx.tenant_settlement_amount)
            if tx.tenant_settlement_amount is not None
            else None,
            "booking_id": tx.booking_id,
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
            "paid_at": tx.paid_at.isoformat() if tx.paid_at else None,
            "client_name": client.full_name if client else None,
            "service_name": service.name if service else None,
            "service_price": float(service.price_amount) if service else None,
            "deposit_amount": float(service.deposit_amount or 0) if service else None,
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
            authorization_url=existing.authorization_url,
            access_code=existing.access_code,
        )

    provider = get_provider(payload.provider)
    provider_intent = await provider.create_intent(
        amount=payload.amount,
        booking_id=payload.booking_id,
        email=payload.email or "customer@example.com",
        callback_url=payload.callback_url or settings.frontend_base_url,
        metadata={"booking_id": payload.booking_id, "purpose": "booking"},
        subaccount_code=payload.subaccount_code,
    )
    tx = PaymentTransaction(
        tenant_id=current_user.tenant_id or "",
        booking_id=payload.booking_id,
        provider=payload.provider,
        provider_reference=provider_intent.reference,
        status=PaymentStatus.pending,
        amount=payload.amount,
        currency="NGN",
        purpose="booking",
        authorization_url=provider_intent.authorization_url,
        access_code=provider_intent.access_code,
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
        authorization_url=tx.authorization_url,
        access_code=tx.access_code,
    )


@router.post("/verify/{reference}")
async def verify_payment_reference(
    reference: str,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Verify a Paystack transaction and apply booking/subscription side effects."""
    try:
        data = await paystack_client.verify_transaction(reference)
    except PaystackError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if (data.get("status") or "").lower() != "success":
        return {"ok": False, "status": data.get("status"), "reference": reference}

    tx = await apply_successful_paystack_payment(session, reference=reference)
    if not tx:
        raise HTTPException(status_code=404, detail="Payment transaction not found")

    await session.commit()
    return {
        "ok": True,
        "status": "succeeded",
        "reference": reference,
        "purpose": tx.purpose,
        "booking_id": tx.booking_id,
        "transaction_id": tx.id,
    }


@router.post("/webhooks/{provider}")
async def receive_webhook(
    provider: str,
    request: Request,
    x_paystack_signature: str | None = Header(default=None, alias="x-paystack-signature"),
    x_signature: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    body = await request.body()

    if provider == "paystack":
        if not verify_paystack_signature(body, x_paystack_signature):
            raise HTTPException(status_code=401, detail="Invalid Paystack webhook signature")
    elif not verify_webhook_signature(body, x_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload = await request.json()

    if provider == "paystack":
        event_id = str(payload.get("id") or payload.get("data", {}).get("id") or payload.get("data", {}).get("reference") or "")
        event_type = payload.get("event")
    else:
        event_id = str(payload.get("id") or "")
        event_type = payload.get("type")

    if not event_id:
        raise HTTPException(status_code=400, detail="Missing event id")

    existing = (
        await session.execute(
            select(WebhookEvent).where(WebhookEvent.provider == provider, WebhookEvent.event_id == event_id)
        )
    ).scalar_one_or_none()
    if existing and existing.processed:
        return {"ok": True}

    event = existing or WebhookEvent(
        provider=provider,
        event_id=event_id,
        payload=payload,
        processed=False,
        attempts=0,
        next_attempt_at=datetime.now(UTC),
    )
    if not existing:
        session.add(event)

    try:
        if provider == "paystack" and event_type == "charge.success":
            reference = (payload.get("data") or {}).get("reference")
            if reference:
                existing_tx = (
                    await session.execute(
                        select(PaymentTransaction).where(
                            PaymentTransaction.provider_reference == str(reference)
                        )
                    )
                ).scalar_one_or_none()
                already_paid = bool(existing_tx and existing_tx.status == PaymentStatus.succeeded)
                tx = await apply_successful_paystack_payment(session, reference=str(reference))
                if tx and tx.purpose == "booking" and tx.booking_id and not already_paid:
                    await _send_booking_emails_after_payment(session, tx.booking_id)
        elif event_type == "payment.succeeded":
            ref = payload.get("data", {}).get("provider_reference")
            if ref:
                await apply_successful_paystack_payment(session, reference=str(ref))
        event.processed = True
    except Exception:
        event.attempts += 1
        event.next_attempt_at = datetime.now(UTC) + timedelta(minutes=min(60, 2 ** event.attempts))
        await session.commit()
        raise

    await session.commit()
    return {"ok": True}


async def _send_booking_emails_after_payment(session: AsyncSession, booking_id: str) -> None:
    booking = (await session.execute(select(Booking).where(Booking.id == booking_id))).scalar_one_or_none()
    if not booking:
        return
    tenant = (await session.execute(select(Tenant).where(Tenant.id == booking.tenant_id))).scalar_one()
    service = (await session.execute(select(Service).where(Service.id == booking.service_id))).scalar_one()
    client = (await session.execute(select(Client).where(Client.id == booking.client_id))).scalar_one()
    owner = await create_booking_notifications(
        session, tenant=tenant, booking=booking, client=client, service=service
    )
    appointment_format = booking.appointment_format or AppointmentFormat.onsite
    appointment_location = resolve_service_location(service, tenant, appointment_format)
    try:
        send_booking_confirmation_email(
            to=client.email,
            client_name=client.full_name,
            business_name=tenant.name,
            service_name=service.name,
            start_at=booking.start_at,
            end_at=booking.end_at,
            location=appointment_location,
            host_name=service.host_name,
            host_title=service.host_title,
            appointment_format=appointment_format.value,
            client_instructions=service.client_instructions,
            online_meeting_link=service.online_meeting_link if appointment_format == AppointmentFormat.online else None,
            booking_id=booking.id,
            is_all_day=bool(booking.is_all_day),
        )
        if owner and owner.email:
            send_new_booking_owner_email(
                to=owner.email,
                owner_name=owner.full_name,
                business_name=tenant.name,
                client_name=client.full_name,
                client_email=client.email,
                service_name=service.name,
                start_at=booking.start_at,
                end_at=booking.end_at,
                appointment_format=appointment_format.value,
                booking_id=booking.id,
            )
    except Exception:
        pass


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
            if event.provider == "paystack" and event.payload.get("event") == "charge.success":
                reference = (event.payload.get("data") or {}).get("reference")
                if reference:
                    await apply_successful_paystack_payment(session, reference=str(reference))
            elif event.payload.get("type") == "payment.succeeded":
                ref = event.payload.get("data", {}).get("provider_reference")
                if ref:
                    await apply_successful_paystack_payment(session, reference=str(ref))
            event.processed = True
            processed += 1
        except Exception:
            event.attempts += 1
            event.next_attempt_at = now + timedelta(minutes=min(60, 2 ** event.attempts))
    await session.commit()
    return {"processed": processed}
