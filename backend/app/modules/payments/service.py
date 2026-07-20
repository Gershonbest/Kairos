"""Payment transaction creation and booking payment helpers."""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.infra import paystack as paystack_client
from app.infra.models import Booking, BookingStatus, Client, PaymentStatus, PaymentTransaction, Service, Tenant
from app.modules.payments.providers import get_provider

settings = get_settings()


def booking_payment_amount(service: Service) -> float:
    deposit = float(service.deposit_amount or 0)
    if deposit > 0:
        return deposit
    return float(service.price_amount)


def platform_fee_percent_for_tenant(tenant: Tenant) -> float:
    if tenant.platform_fee_percent is not None:
        return float(tenant.platform_fee_percent)
    return float(settings.paystack_platform_fee_percent)


def split_amounts(gross: float, fee_percent: float) -> tuple[float, float]:
    fee = round(gross * (fee_percent / 100.0), 2)
    settlement = round(max(0.0, gross - fee), 2)
    return fee, settlement


def callback_base_url() -> str:
    return (settings.paystack_callback_base_url or settings.frontend_base_url).rstrip("/")


async def ensure_booking_payment(
    session: AsyncSession,
    booking: Booking,
    service: Service,
    idempotency_key: str,
    tenant: Tenant | None = None,
) -> PaymentTransaction | None:
    amount = booking_payment_amount(service)
    if amount <= 0:
        return None

    existing = (
        await session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.tenant_id == booking.tenant_id,
                PaymentTransaction.booking_id == booking.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    payments_enabled = bool(tenant and tenant.payments_enabled and tenant.payment_account_id)
    provider = "paystack" if payments_enabled else "kairos"
    status = PaymentStatus.pending if payments_enabled else PaymentStatus.succeeded
    fee_percent = platform_fee_percent_for_tenant(tenant) if tenant else float(settings.paystack_platform_fee_percent)
    fee_amount, settlement_amount = split_amounts(amount, fee_percent) if payments_enabled else (None, None)

    tx = PaymentTransaction(
        tenant_id=booking.tenant_id,
        booking_id=booking.id,
        provider=provider,
        provider_reference=f"booking-{booking.id}",
        status=status,
        amount=amount,
        currency="NGN",
        platform_fee_amount=fee_amount,
        tenant_settlement_amount=settlement_amount,
        purpose="booking",
        idempotency_key=f"pay-{idempotency_key}",
        paid_at=datetime.now(UTC) if status == PaymentStatus.succeeded else None,
    )
    session.add(tx)
    await session.flush()
    return tx


async def initialize_booking_paystack(
    session: AsyncSession,
    *,
    tenant: Tenant,
    booking: Booking,
    client: Client,
    tx: PaymentTransaction,
    business_key: str | None = None,
) -> PaymentTransaction:
    """Initialize (or reuse) a Paystack checkout for a pending booking payment."""
    if tx.authorization_url and tx.status == PaymentStatus.pending:
        return tx
    if tx.status == PaymentStatus.succeeded:
        return tx
    if not tenant.payment_account_id:
        raise ValueError("Tenant has no Paystack subaccount connected")
    if not paystack_client.is_configured():
        raise ValueError("Paystack is not configured on the server")

    amount = float(tx.amount)
    fee_percent = platform_fee_percent_for_tenant(tenant)
    fee_amount, settlement_amount = split_amounts(amount, fee_percent)
    tx.platform_fee_amount = fee_amount
    tx.tenant_settlement_amount = settlement_amount
    tx.currency = "NGN"
    tx.purpose = "booking"
    tx.provider = "paystack"

    tenant_key = business_key or tenant.public_slug or tenant.id
    reference = f"ps_{booking.id.replace('-', '')[:12]}_{tx.id.replace('-', '')[:8]}"
    query = urlencode({"payment": "1", "booking_id": booking.id, "reference": reference})
    callback_url = f"{callback_base_url()}/book/{tenant_key}?{query}"

    intent = await get_provider("paystack").create_intent(
        amount=amount,
        booking_id=booking.id,
        email=client.email,
        callback_url=callback_url,
        metadata={
            "booking_id": booking.id,
            "tenant_id": tenant.id,
            "transaction_id": tx.id,
            "purpose": "booking",
        },
        subaccount_code=tenant.payment_account_id,
        reference=reference,
    )
    tx.provider_reference = intent.reference
    tx.authorization_url = intent.authorization_url
    tx.access_code = intent.access_code
    tx.status = PaymentStatus.pending
    await session.flush()
    return tx


async def confirm_booking_payment(
    session: AsyncSession,
    booking: Booking,
    *,
    paid_at: datetime | None = None,
) -> PaymentTransaction | None:
    tx = (
        await session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.tenant_id == booking.tenant_id,
                PaymentTransaction.booking_id == booking.id,
            )
        )
    ).scalar_one_or_none()
    if not tx:
        return None
    if tx.status == PaymentStatus.succeeded:
        return tx

    tx.status = PaymentStatus.succeeded
    tx.paid_at = paid_at or datetime.now(UTC)
    if booking.status == BookingStatus.pending:
        booking.status = BookingStatus.confirmed
    return tx


async def apply_successful_paystack_payment(
    session: AsyncSession,
    *,
    reference: str,
    paid_at: datetime | None = None,
) -> PaymentTransaction | None:
    tx = (
        await session.execute(
            select(PaymentTransaction).where(PaymentTransaction.provider_reference == reference)
        )
    ).scalar_one_or_none()
    if not tx:
        return None
    if tx.status == PaymentStatus.succeeded:
        return tx

    tx.status = PaymentStatus.succeeded
    tx.paid_at = paid_at or datetime.now(UTC)

    if tx.purpose == "booking" and tx.booking_id:
        booking = (
            await session.execute(select(Booking).where(Booking.id == tx.booking_id))
        ).scalar_one_or_none()
        if booking and booking.status == BookingStatus.pending:
            booking.status = BookingStatus.confirmed
    elif tx.purpose == "subscription":
        from app.modules.subscriptions.service import activate_plan_from_payment

        await activate_plan_from_payment(session, tx)

    return tx
