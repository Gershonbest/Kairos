"""Subscription plan catalog, trial lifecycle, and billing helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.plans import (
    PLAN_CATALOG,
    PlanCode,
    PlanFeature,
    coerce_plan_code,
    plan_code_value,
    plan_definition,
    plan_has_feature,
    require_plan_code,
)
from app.infra.models import SubscriptionPlan, Tenant, User

settings = get_settings()


def serialize_plan(plan: SubscriptionPlan, *, include_admin_fields: bool = False) -> dict:
    definition = plan_definition(plan.code)
    payload = {
        "code": definition.code.value,
        "name": definition.name,
        "monthly_price": float(definition.monthly_price),
        "description": definition.description,
        "features": definition.feature_labels(),
        "feature_codes": definition.feature_codes(),
        "entitlements": definition.entitlements(),
        "self_serve": definition.self_serve,
        "is_featured": definition.is_featured,
    }
    if include_admin_fields:
        payload.update(
            {
                "id": plan.id,
                "is_active": definition.is_active,
                "sort_order": definition.sort_order,
            }
        )
    return payload


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def start_tenant_trial(tenant: Tenant, *, now: datetime | None = None) -> None:
    now = now or datetime.now(UTC)
    tenant.status = "trial"
    tenant.trial_started_at = now
    tenant.trial_ends_at = now + timedelta(days=settings.trial_days)
    tenant.trial_warning_sent_at = None
    tenant.plan_code = coerce_plan_code(tenant.plan_code)


def _tenant_phone(tenant: Tenant) -> str | None:
    number = (tenant.phone_number or "").strip()
    if not number:
        return None
    dial_code = (tenant.phone_country_code or "").strip()
    if not dial_code or number.startswith("+"):
        return number
    return f"{dial_code}{number.lstrip('0')}"


def _days_remaining(until: datetime, now: datetime) -> int:
    delta = until - now
    if delta.total_seconds() <= 0:
        return 0
    return max(1, int(delta.total_seconds() // 86400) + (1 if delta.total_seconds() % 86400 else 0))


def subscription_status_payload(tenant: Tenant, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    paid_until = _as_utc(tenant.subscription_paid_until)
    trial_ends = _as_utc(tenant.trial_ends_at)

    # Admin/platform holds must win over an otherwise-valid paid period.
    if tenant.status == "suspended":
        return {
            "status": "suspended",
            "plan_code": plan_code_value(tenant.plan_code),
            "is_trial": False,
            "requires_plan_selection": True,
            "days_remaining": 0,
            "trial_ends_at": trial_ends.isoformat() if trial_ends else None,
            "subscription_paid_until": paid_until.isoformat() if paid_until else None,
            "warning_level": "suspended",
            "warning_message": "Your account is suspended. Please contact support.",
        }

    if tenant.status == "inactive":
        return {
            "status": "inactive",
            "plan_code": plan_code_value(tenant.plan_code),
            "is_trial": False,
            "requires_plan_selection": True,
            "days_remaining": 0,
            "trial_ends_at": trial_ends.isoformat() if trial_ends else None,
            "subscription_paid_until": paid_until.isoformat() if paid_until else None,
            "warning_level": "suspended",
            "warning_message": "This business has been deactivated.",
        }

    if paid_until and paid_until > now:
        return {
            "status": "active",
            "plan_code": plan_code_value(tenant.plan_code),
            "is_trial": False,
            "requires_plan_selection": False,
            "days_remaining": _days_remaining(paid_until, now),
            "trial_ends_at": trial_ends.isoformat() if trial_ends else None,
            "subscription_paid_until": paid_until.isoformat(),
            "warning_level": None,
            "warning_message": None,
        }

    if trial_ends and trial_ends > now:
        days_left = _days_remaining(trial_ends, now)
        warning_level = None
        warning_message = None
        if days_left <= settings.trial_warning_days:
            warning_level = "ending_soon"
            day_label = "day" if days_left == 1 else "days"
            warning_message = (
                f"Your free trial ends in {days_left} {day_label}. "
                "Choose a plan to keep your bookings and dashboard access."
            )
        return {
            "status": "trial",
            "plan_code": plan_code_value(tenant.plan_code),
            "is_trial": True,
            "requires_plan_selection": False,
            "days_remaining": days_left,
            "trial_ends_at": trial_ends.isoformat(),
            "subscription_paid_until": None,
            "warning_level": warning_level,
            "warning_message": warning_message,
        }

    return {
        "status": "expired",
        "plan_code": plan_code_value(tenant.plan_code),
        "is_trial": False,
        "requires_plan_selection": True,
        "days_remaining": 0,
        "trial_ends_at": trial_ends.isoformat() if trial_ends else None,
        "subscription_paid_until": None,
        "warning_level": "expired",
        "warning_message": "Your free trial has ended. Choose a plan to continue using Orheo Bookings.",
    }


def tenant_has_active_access(tenant: Tenant, *, now: datetime | None = None) -> bool:
    return not subscription_status_payload(tenant, now=now)["requires_plan_selection"]


async def ensure_default_plans(session: AsyncSession) -> None:
    existing = (await session.execute(select(SubscriptionPlan))).scalars().all()
    existing_by_code = {coerce_plan_code(plan.code): plan for plan in existing}
    for definition in PLAN_CATALOG.values():
        seed = definition.seed_dict()
        plan = existing_by_code.get(definition.code)
        if plan is None:
            session.add(
                SubscriptionPlan(
                    code=definition.code,
                    name=seed["name"],
                    monthly_price=seed["monthly_price"],
                    description=seed["description"],
                    features=seed["features"],
                    entitlements=seed["entitlements"],
                    self_serve=seed["self_serve"],
                    is_active=seed["is_active"],
                    is_featured=seed["is_featured"],
                    sort_order=seed["sort_order"],
                )
            )
            continue
        plan.name = seed["name"]
        plan.monthly_price = seed["monthly_price"]
        plan.description = seed["description"]
        plan.features = seed["features"]
        plan.entitlements = seed["entitlements"]
        plan.self_serve = seed["self_serve"]
        plan.is_active = seed["is_active"]
        plan.is_featured = seed["is_featured"]
        plan.sort_order = seed["sort_order"]
    await session.commit()


async def list_public_plans(session: AsyncSession) -> list[dict]:
    await ensure_default_plans(session)
    plans = (
        await session.execute(
            select(SubscriptionPlan)
            .where(SubscriptionPlan.is_active.is_(True))
            .order_by(SubscriptionPlan.sort_order, SubscriptionPlan.monthly_price)
        )
    ).scalars().all()
    return [serialize_plan(plan) for plan in plans]


async def list_admin_plans(session: AsyncSession) -> list[dict]:
    await ensure_default_plans(session)
    plans = (
        await session.execute(
            select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order, SubscriptionPlan.monthly_price)
        )
    ).scalars().all()
    return [serialize_plan(plan, include_admin_fields=True) for plan in plans]


async def activate_plan(
    session: AsyncSession,
    tenant: Tenant,
    plan_code: PlanCode | str,
    *,
    now: datetime | None = None,
) -> dict:
    code = require_plan_code(plan_code)
    definition = plan_definition(code)
    plan = (
        await session.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.code == code,
                SubscriptionPlan.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not plan:
        raise ValueError("Unknown subscription plan")
    if not definition.self_serve:
        raise ValueError("This plan requires sales assistance. Please contact us for Enterprise pricing.")

    now = now or datetime.now(UTC)
    tenant.plan_code = code
    tenant.status = "active"
    tenant.subscription_paid_until = now + timedelta(days=30)
    tenant.trial_warning_sent_at = None
    await session.commit()
    await session.refresh(tenant)
    return subscription_status_payload(tenant, now=now)


async def grant_plan_to_tenant(
    session: AsyncSession,
    tenant: Tenant,
    plan_code: PlanCode | str,
    *,
    days: int = 30,
    now: datetime | None = None,
) -> dict:
    """Admin complimentary plan grant (no payment). Does not commit."""
    if tenant.status == "inactive":
        raise ValueError("Cannot grant a plan to a deactivated business")
    if days < 1:
        raise ValueError("Grant period must be at least 1 day")

    code = require_plan_code(plan_code)
    plan = (
        await session.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.code == code,
                SubscriptionPlan.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not plan:
        raise ValueError("Unknown or inactive subscription plan")

    now = now or datetime.now(UTC)
    # If they already have paid time remaining, extend from that date so a
    # complimentary grant never shortens an existing paid period.
    paid_until = _as_utc(tenant.subscription_paid_until)
    start = paid_until if paid_until and paid_until > now else now

    before = {
        "plan_code": plan_code_value(tenant.plan_code),
        "status": tenant.status,
        "subscription_paid_until": paid_until.isoformat() if paid_until else None,
    }
    tenant.plan_code = code
    tenant.status = "active"
    tenant.subscription_paid_until = start + timedelta(days=days)
    tenant.trial_warning_sent_at = None
    return {
        "before": before,
        "plan_code": plan_code_value(tenant.plan_code),
        "status": tenant.status,
        "subscription_paid_until": tenant.subscription_paid_until.isoformat(),
        "grant_days": days,
        "subscription": subscription_status_payload(tenant, now=now),
    }


async def activate_plan_from_payment(session: AsyncSession, tx) -> None:
    """Activate a tenant plan after a successful Paystack subscription payment (no commit)."""
    code = require_plan_code(tenant_plan_from_reference(tx))
    plan = (
        await session.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.code == code,
                SubscriptionPlan.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not plan:
        raise ValueError(f"Unknown subscription plan: {code.value}")

    tenant = (await session.execute(select(Tenant).where(Tenant.id == tx.tenant_id))).scalar_one()
    if tenant.status == "inactive":
        raise ValueError("Cannot activate a deactivated business")
    now = tx.paid_at or datetime.now(UTC)
    tenant.plan_code = code
    tenant.status = "active"
    tenant.subscription_paid_until = now + timedelta(days=30)
    tenant.trial_warning_sent_at = None


def tenant_plan_from_reference(tx) -> str:
    # provider_reference format: sub_{plan}_{tenant8}_{rand}
    ref = tx.provider_reference or ""
    if ref.startswith("sub_"):
        bits = ref.split("_")
        if len(bits) >= 2:
            return bits[1]
    raise ValueError("Unable to determine plan from payment reference")


async def create_subscription_checkout(
    session: AsyncSession,
    *,
    tenant: Tenant,
    owner: User,
    plan_code: PlanCode | str,
) -> dict:
    """Create a Paystack checkout for monthly plan payment (100% to Orheo)."""
    import uuid

    from app.infra.paystack import paystack_client
    from app.infra.models import PaymentStatus, PaymentTransaction
    from app.modules.payments.service import platform_payment_callback_url

    code = require_plan_code(plan_code)
    definition = plan_definition(code)
    plan = (
        await session.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.code == code,
                SubscriptionPlan.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not plan:
        raise ValueError("Unknown subscription plan")
    if not definition.self_serve:
        raise ValueError("This plan requires sales assistance. Please contact us for Enterprise pricing.")
    if not paystack_client.is_configured():
        raise ValueError("Paystack is not configured on the server")

    amount = float(definition.monthly_price)
    if amount <= 0:
        return await activate_plan(session, tenant, code)

    reference = f"sub_{code.value}_{tenant.id.replace('-', '')[:8]}_{uuid.uuid4().hex[:8]}"
    idempotency_key = f"sub-{tenant.id}-{code.value}-{uuid.uuid4().hex[:8]}"
    callback_url = platform_payment_callback_url(reference=reference)

    intent = await paystack_client.initialize_transaction(
        email=owner.email,
        amount_naira=amount,
        reference=reference,
        callback_url=callback_url,
        metadata={
            "tenant_id": tenant.id,
            "plan_code": code.value,
            "purpose": "subscription",
        },
        customer_name=owner.full_name,
        customer_phone=_tenant_phone(tenant),
    )

    tx = PaymentTransaction(
        tenant_id=tenant.id,
        booking_id=None,
        provider="paystack",
        provider_reference=intent.get("reference") or reference,
        status=PaymentStatus.pending,
        amount=amount,
        currency="NGN",
        platform_fee_amount=amount,
        tenant_settlement_amount=0,
        purpose="subscription",
        authorization_url=intent.get("authorization_url"),
        access_code=intent.get("access_code"),
        idempotency_key=idempotency_key,
    )
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return {
        "transaction_id": tx.id,
        "provider": tx.provider,
        "provider_reference": tx.provider_reference,
        "authorization_url": tx.authorization_url,
        "access_code": tx.access_code,
        "amount": float(tx.amount),
        "plan_code": code.value,
        "status": tx.status.value,
    }


async def tenant_allows_payment_processing(session: AsyncSession, tenant: Tenant) -> bool:
    """Active trial or any paid plan with payment_processing can connect Paystack."""
    await ensure_default_plans(session)
    status = subscription_status_payload(tenant)
    if status.get("is_trial"):
        return True
    return plan_has_feature(tenant.plan_code, PlanFeature.payment_processing)


async def maybe_send_trial_warning(
    session: AsyncSession,
    tenant: Tenant,
    owner: User | None,
) -> bool:
    status = subscription_status_payload(tenant)
    if status["warning_level"] != "ending_soon":
        return False
    if tenant.trial_warning_sent_at is not None:
        return False
    if not owner or not owner.email:
        return False

    from app.modules.notifications.service import send_trial_ending_email

    days_left = status["days_remaining"]
    send_trial_ending_email(
        to=owner.email,
        full_name=owner.full_name,
        business_name=tenant.name,
        days_remaining=days_left,
        choose_plan_url=f"{settings.frontend_base_url.rstrip('/')}/dashboard/choose-plan",
    )
    tenant.trial_warning_sent_at = datetime.now(UTC)
    await session.commit()
    return True
