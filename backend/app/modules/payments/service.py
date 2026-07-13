"""Payment transaction creation and booking payment helpers."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.models import Booking, BookingStatus, PaymentStatus, PaymentTransaction, Service, Tenant


def booking_payment_amount(service: Service) -> float:
    deposit = float(service.deposit_amount or 0)
    if deposit > 0:
        return deposit
    return float(service.price_amount)


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

    payments_enabled = bool(tenant and tenant.payments_enabled)
    provider = tenant.payment_provider if payments_enabled and tenant.payment_provider else "kairos"
    status = PaymentStatus.pending if payments_enabled else PaymentStatus.succeeded

    tx = PaymentTransaction(
        tenant_id=booking.tenant_id,
        booking_id=booking.id,
        provider=provider,
        provider_reference=f"booking-{booking.id}",
        status=status,
        amount=amount,
        idempotency_key=f"pay-{idempotency_key}",
    )
    session.add(tx)
    return tx


async def confirm_booking_payment(
    session: AsyncSession,
    booking: Booking,
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
    if booking.status == BookingStatus.pending:
        booking.status = BookingStatus.confirmed
    return tx
