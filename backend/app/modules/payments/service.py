"""Payment transaction creation and booking payment helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.infra.models import Booking, BookingStatus, Client, PaymentStatus, PaymentTransaction, Service, Tenant
from app.infra.paystack import paystack_client
from app.modules.clients.names import visit_display_name
from app.modules.payments.providers import get_provider

settings = get_settings()

PAYSTACK_SUCCESS_STATUSES = frozenset({"success"})
PAYSTACK_FAILED_STATUSES = frozenset({"failed", "abandoned", "reversed", "cancelled"})

BOOKING_CHARGE_PURPOSES = frozenset({"booking", "deposit"})
BOOKING_LEDGER_PURPOSES = frozenset({"booking", "deposit", "balance"})
BALANCE_PAYMENT_METHODS = frozenset({"cash", "bank_transfer", "pos", "other"})


class BookingPaymentError(ValueError):
    pass


def classify_paystack_status(status: str | None) -> str:
    """Return success, failed, or pending for a Paystack transaction status."""
    normalized = (status or "").strip().lower()
    if normalized in PAYSTACK_SUCCESS_STATUSES:
        return "success"
    if normalized in PAYSTACK_FAILED_STATUSES:
        return "failed"
    return "pending"


def booking_payment_amount(service: Service) -> float:
    deposit = float(service.deposit_amount or 0)
    if deposit > 0:
        return deposit
    return float(service.price_amount)


def service_total_amount(service: Service) -> float:
    return float(service.price_amount or 0)


def is_partial_deposit_service(service: Service) -> bool:
    deposit = float(service.deposit_amount or 0)
    total = service_total_amount(service)
    return deposit > 0 and deposit < total - 0.009


def initial_booking_payment_purpose(service: Service) -> str:
    return "deposit" if is_partial_deposit_service(service) else "booking"


async def booking_payment_transactions(
    session: AsyncSession,
    *,
    booking_id: str,
    succeeded_only: bool = False,
) -> list[PaymentTransaction]:
    query = select(PaymentTransaction).where(
        PaymentTransaction.booking_id == booking_id,
        PaymentTransaction.purpose.in_(tuple(BOOKING_LEDGER_PURPOSES)),
    )
    if succeeded_only:
        query = query.where(PaymentTransaction.status == PaymentStatus.succeeded)
    rows = (await session.execute(query.order_by(PaymentTransaction.created_at.asc()))).scalars().all()
    return list(rows)


async def collected_for_booking(session: AsyncSession, booking_id: str) -> float:
    txs = await booking_payment_transactions(session, booking_id=booking_id, succeeded_only=True)
    return round(sum(float(tx.amount) for tx in txs), 2)


def compute_balance_due(*, service: Service, booking: Booking, collected: float) -> float:
    if booking.balance_waived:
        return 0.0
    if booking.status == BookingStatus.no_show:
        return 0.0
    total = service_total_amount(service)
    return round(max(0.0, total - collected), 2)


def compute_payment_state(*, service: Service, booking: Booking, collected: float) -> str:
    total = service_total_amount(service)
    if booking.balance_waived:
        return "waived"
    if collected >= total - 0.009:
        return "fully_paid"
    if booking.status == BookingStatus.no_show and collected > 0 and collected < total - 0.009:
        return "forfeited"
    if collected > 0:
        return "deposit_paid"
    return "unpaid"


async def booking_payment_summary(
    session: AsyncSession,
    *,
    booking: Booking,
    service: Service,
) -> dict[str, float | bool | str]:
    collected = await collected_for_booking(session, booking.id)
    total = service_total_amount(service)
    deposit = float(service.deposit_amount or 0)
    balance_due = compute_balance_due(service=service, booking=booking, collected=collected)
    return {
        "service_price": total,
        "deposit_amount": deposit,
        "collected_total": collected,
        "balance_due": balance_due,
        "balance_waived": bool(booking.balance_waived),
        "payment_state": compute_payment_state(service=service, booking=booking, collected=collected),
    }


async def record_balance_payment(
    session: AsyncSession,
    *,
    tenant_id: str,
    booking: Booking,
    service: Service,
    amount: float,
    method: str,
    paid_at: datetime | None = None,
    notes: str | None = None,
) -> PaymentTransaction:
    if booking.tenant_id != tenant_id:
        raise BookingPaymentError("Booking not found")
    if booking.status not in {BookingStatus.confirmed, BookingStatus.completed}:
        raise BookingPaymentError("Balance can only be recorded for confirmed or completed appointments")
    if booking.balance_waived:
        raise BookingPaymentError("Balance was waived for this booking")

    normalized_method = (method or "").strip().lower()
    if normalized_method not in BALANCE_PAYMENT_METHODS:
        raise BookingPaymentError("Invalid payment method")

    collected = await collected_for_booking(session, booking.id)
    balance_due = compute_balance_due(service=service, booking=booking, collected=collected)
    if balance_due <= 0:
        raise BookingPaymentError("No balance is due for this booking")

    normalized_amount = round(float(amount), 2)
    if normalized_amount <= 0:
        raise BookingPaymentError("Amount must be greater than zero")
    if normalized_amount > balance_due + 0.009:
        raise BookingPaymentError(f"Amount exceeds remaining balance ({balance_due:.2f})")

    when = paid_at or datetime.now(UTC)
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    else:
        when = when.astimezone(UTC)

    reference_suffix = uuid.uuid4().hex[:8]
    tx = PaymentTransaction(
        tenant_id=tenant_id,
        booking_id=booking.id,
        provider=normalized_method,
        provider_reference=f"balance-{booking.id[:8]}-{reference_suffix}",
        status=PaymentStatus.succeeded,
        amount=normalized_amount,
        currency="NGN",
        platform_fee_amount=None,
        tenant_settlement_amount=None,
        purpose="balance",
        idempotency_key=f"balance-{booking.id}-{reference_suffix}",
        paid_at=when,
    )
    session.add(tx)
    await session.flush()
    return tx


async def waive_booking_balance(
    session: AsyncSession,
    *,
    tenant_id: str,
    booking: Booking,
    service: Service,
) -> Booking:
    if booking.tenant_id != tenant_id:
        raise BookingPaymentError("Booking not found")
    collected = await collected_for_booking(session, booking.id)
    balance_due = compute_balance_due(service=service, booking=booking, collected=collected)
    if balance_due <= 0:
        raise BookingPaymentError("No outstanding balance to waive")
    booking.balance_waived = True
    await session.flush()
    return booking


def platform_fee_percent_for_tenant(tenant: Tenant | None = None) -> float:
    """Active merchant fee from server config (PAYSTACK_PLATFORM_FEE_PERCENT)."""
    _ = tenant
    return float(get_settings().paystack_platform_fee_percent)


def split_amounts(gross: float, fee_percent: float) -> tuple[float, float]:
    fee = round(gross * (fee_percent / 100.0), 2)
    settlement = round(max(0.0, gross - fee), 2)
    return fee, settlement


def _trim_url(value: str | None) -> str:
    return (value or "").strip().rstrip("/")


def _with_query(base: str, params: dict[str, str]) -> str:
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}{urlencode(params)}"


_PLATFORM_RETURN_PATH = "/dashboard"
_LEGACY_PLATFORM_RETURN_PATH = "/dashboard/choose-plan"


def callback_base_url() -> str:
    """Origin used for business-to-platform (subscription) Paystack redirects."""
    explicit = _trim_url(settings.paystack_callback_url_platform)
    if explicit:
        for marker in (_LEGACY_PLATFORM_RETURN_PATH, _PLATFORM_RETURN_PATH):
            if marker in explicit:
                return explicit.split(marker, 1)[0].rstrip("/")
        return explicit
    return _trim_url(settings.frontend_base_url)


def platform_payment_callback_url(*, reference: str) -> str:
    """Paystack return URL after a business pays Orheo for a plan."""
    explicit = _trim_url(settings.paystack_callback_url_platform)
    if explicit:
        base = explicit.replace(_LEGACY_PLATFORM_RETURN_PATH, _PLATFORM_RETURN_PATH)
        if not base.rstrip("/").endswith(_PLATFORM_RETURN_PATH):
            base = f"{base}{_PLATFORM_RETURN_PATH}"
    else:
        base = f"{callback_base_url()}{_PLATFORM_RETURN_PATH}"
    return _with_query(base, {"payment": "1", "reference": reference})


def callback_booking_base_url() -> str:
    """Base URL used for client-to-business booking callback redirects.

    Priority:
    1) PAYSTACK_CALLBACK_URL_BOOKING (already includes `/book`)
    2) PUBLIC_BOOKING_BASE_URL (already includes `/book`)
    3) FRONTEND_BASE_URL (origin only) + `/book`
    """
    explicit = _trim_url(settings.paystack_callback_url_booking)
    if explicit:
        return explicit
    public_booking_base = _trim_url(settings.public_booking_base_url)
    if public_booking_base:
        return public_booking_base
    return f"{_trim_url(settings.frontend_base_url)}/book"


def booking_payment_callback_url(*, tenant_key: str, booking_id: str, reference: str) -> str:
    """Paystack return URL after a client pays a business for a booking."""
    return _with_query(
        f"{callback_booking_base_url()}/{tenant_key}",
        {"payment": "1", "booking_id": booking_id, "reference": reference},
    )


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
                PaymentTransaction.purpose.in_(tuple(BOOKING_CHARGE_PURPOSES)),
            )
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    payments_enabled = bool(tenant and tenant.payments_enabled and tenant.payment_account_id)
    provider = "paystack" if payments_enabled else "orheo"
    status = PaymentStatus.pending if payments_enabled else PaymentStatus.succeeded
    fee_percent = platform_fee_percent_for_tenant(tenant)
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
        purpose=initial_booking_payment_purpose(service),
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
    tx.provider = "paystack"

    tenant_key = business_key or tenant.public_slug or tenant.id
    reference = f"ps_{booking.id.replace('-', '')[:12]}_{tx.id.replace('-', '')[:8]}_{uuid.uuid4().hex[:6]}"
    callback_url = booking_payment_callback_url(
        tenant_key=tenant_key,
        booking_id=booking.id,
        reference=reference,
    )

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
        customer_name=visit_display_name(booking, client),
        customer_phone=client.phone,
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
                PaymentTransaction.purpose.in_(tuple(BOOKING_CHARGE_PURPOSES)),
            )
        )
    ).scalar_one_or_none()
    if not tx:
        return None
    if tx.status == PaymentStatus.succeeded:
        return tx

    previous_status = tx.status.value
    tx.status = PaymentStatus.succeeded
    tx.paid_at = paid_at or datetime.now(UTC)
    if booking.status == BookingStatus.pending:
        booking.status = BookingStatus.confirmed
    from app.modules.audit.service import record_audit_event

    await record_audit_event(
        session,
        action="payment.status_changed",
        entity_type="payment_transaction",
        entity_id=tx.id,
        tenant_id=tx.tenant_id,
        actor_role="system",
        metadata={
            "from_status": previous_status,
            "to_status": PaymentStatus.succeeded.value,
            "purpose": tx.purpose,
            "provider_reference": tx.provider_reference,
            "amount": float(tx.amount),
            "source": "confirm_booking_payment",
        },
    )
    return tx


async def mark_failed_paystack_payment(
    session: AsyncSession,
    *,
    reference: str,
    gateway_status: str | None = None,
    source: str = "mark_failed_paystack_payment",
) -> PaymentTransaction | None:
    """Mark a Paystack payment failed and release an unpaid pending booking."""
    tx = (
        await session.execute(
            select(PaymentTransaction).where(PaymentTransaction.provider_reference == reference)
        )
    ).scalar_one_or_none()
    if not tx:
        return None
    if tx.status in {PaymentStatus.succeeded, PaymentStatus.refunded}:
        return tx
    if tx.status == PaymentStatus.failed:
        return tx

    previous_status = tx.status.value
    tx.status = PaymentStatus.failed
    tx.authorization_url = None
    tx.access_code = None

    if tx.purpose in BOOKING_CHARGE_PURPOSES and tx.booking_id:
        booking = (
            await session.execute(select(Booking).where(Booking.id == tx.booking_id))
        ).scalar_one_or_none()
        if booking and booking.status == BookingStatus.pending:
            booking.status = BookingStatus.cancelled
            failed_suffix = f":failed:{tx.id[:8]}"
            if not booking.idempotency_key.endswith(failed_suffix):
                booking.idempotency_key = f"{booking.idempotency_key}{failed_suffix}"[:120]

    from app.modules.audit.service import record_audit_event

    await record_audit_event(
        session,
        action="payment.status_changed",
        entity_type="payment_transaction",
        entity_id=tx.id,
        tenant_id=tx.tenant_id,
        actor_role="system",
        metadata={
            "from_status": previous_status,
            "to_status": PaymentStatus.failed.value,
            "purpose": tx.purpose,
            "provider_reference": tx.provider_reference,
            "amount": float(tx.amount),
            "gateway_status": gateway_status,
            "source": source,
        },
    )
    return tx


STALE_PENDING_PAYMENT_MINUTES = 30


async def expire_stale_pending_booking_payments(
    session: AsyncSession,
    *,
    tenant_id: str,
) -> int:
    """Release slots held by unpaid bookings whose checkout was abandoned."""
    cutoff = datetime.now(UTC) - timedelta(minutes=STALE_PENDING_PAYMENT_MINUTES)
    rows = (
        await session.execute(
            select(PaymentTransaction, Booking)
            .join(Booking, Booking.id == PaymentTransaction.booking_id)
            .where(
                PaymentTransaction.tenant_id == tenant_id,
                PaymentTransaction.purpose.in_(tuple(BOOKING_CHARGE_PURPOSES)),
                PaymentTransaction.status == PaymentStatus.pending,
                PaymentTransaction.created_at <= cutoff,
                Booking.status == BookingStatus.pending,
            )
        )
    ).all()
    released = 0
    for tx, _booking in rows:
        marked = await mark_failed_paystack_payment(
            session,
            reference=tx.provider_reference,
            gateway_status="expired",
            source="expire_stale_pending_booking_payments",
        )
        if marked:
            released += 1
    return released


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

    previous_status = tx.status.value
    tx.status = PaymentStatus.succeeded
    tx.paid_at = paid_at or datetime.now(UTC)

    if tx.purpose in BOOKING_CHARGE_PURPOSES and tx.booking_id:
        booking = (
            await session.execute(select(Booking).where(Booking.id == tx.booking_id))
        ).scalar_one_or_none()
        if booking and booking.status in {BookingStatus.pending, BookingStatus.cancelled}:
            booking.status = BookingStatus.confirmed
    elif tx.purpose == "subscription":
        from app.modules.subscriptions.service import activate_plan_from_payment

        await activate_plan_from_payment(session, tx)

    from app.modules.audit.service import record_audit_event

    await record_audit_event(
        session,
        action="payment.status_changed",
        entity_type="payment_transaction",
        entity_id=tx.id,
        tenant_id=tx.tenant_id,
        actor_role="system",
        metadata={
            "from_status": previous_status,
            "to_status": PaymentStatus.succeeded.value,
            "purpose": tx.purpose,
            "provider_reference": tx.provider_reference,
            "amount": float(tx.amount),
            "source": "apply_successful_paystack_payment",
        },
    )

    return tx
