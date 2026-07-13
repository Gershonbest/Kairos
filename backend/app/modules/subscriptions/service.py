"""Subscription plan catalog, trial lifecycle, and billing helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.infra.models import SubscriptionPlan, Tenant, User

settings = get_settings()

DEFAULT_PLANS: list[dict] = [
    {
        "code": "standard",
        "name": "Standard",
        "monthly_price": 15000.0,
        "description": "Perfect for solo practitioners and small teams getting started",
        "features": [
            "Up to 100 bookings/month",
            "1 team member",
            "Email notifications",
            "Client database",
            "Mobile booking page",
            "Standard support",
        ],
        "entitlements": {
            "bookings_per_month": 100,
            "team_members": 1,
            "ai_assistant": False,
            "custom_branding": False,
            "payment_processing": False,
        },
        "self_serve": True,
        "is_active": True,
        "is_featured": False,
        "sort_order": 1,
    },
    {
        "code": "premium",
        "name": "Premium",
        "monthly_price": 45000.0,
        "description": "For growing businesses that need advanced features and AI",
        "features": [
            "Unlimited bookings",
            "Up to 5 team members",
            "AI booking assistant",
            "Payment processing",
            "Custom branding",
            "Priority support",
            "Analytics dashboard",
        ],
        "entitlements": {
            "bookings_per_month": None,
            "team_members": 5,
            "ai_assistant": True,
            "custom_branding": True,
            "payment_processing": True,
        },
        "self_serve": True,
        "is_active": True,
        "is_featured": True,
        "sort_order": 2,
    },
    {
        "code": "enterprise",
        "name": "Enterprise",
        "monthly_price": 120000.0,
        "description": "Complete solution for multi-location businesses",
        "features": [
            "Everything in Premium",
            "Unlimited team members",
            "Multi-location support",
            "API access",
            "White-label options",
            "Dedicated account manager",
        ],
        "entitlements": {
            "bookings_per_month": None,
            "team_members": None,
            "ai_assistant": True,
            "custom_branding": True,
            "payment_processing": True,
            "api_access": True,
            "white_label": True,
        },
        "self_serve": False,
        "is_active": True,
        "is_featured": False,
        "sort_order": 3,
    },
]


def serialize_plan(plan: SubscriptionPlan, *, include_admin_fields: bool = False) -> dict:
    payload = {
        "code": plan.code,
        "name": plan.name,
        "monthly_price": float(plan.monthly_price),
        "description": plan.description or "",
        "features": plan.features or [],
        "entitlements": plan.entitlements or {},
        "self_serve": plan.self_serve,
        "is_featured": plan.is_featured,
    }
    if include_admin_fields:
        payload.update(
            {
                "id": plan.id,
                "is_active": plan.is_active,
                "sort_order": plan.sort_order,
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
    if not tenant.plan_code or tenant.plan_code == "standard":
        tenant.plan_code = "standard"


def _days_remaining(until: datetime, now: datetime) -> int:
    delta = until - now
    if delta.total_seconds() <= 0:
        return 0
    return max(1, int(delta.total_seconds() // 86400) + (1 if delta.total_seconds() % 86400 else 0))


def subscription_status_payload(tenant: Tenant, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    paid_until = _as_utc(tenant.subscription_paid_until)
    trial_ends = _as_utc(tenant.trial_ends_at)

    if paid_until and paid_until > now:
        return {
            "status": "active",
            "plan_code": tenant.plan_code,
            "is_trial": False,
            "requires_plan_selection": False,
            "days_remaining": _days_remaining(paid_until, now),
            "trial_ends_at": trial_ends.isoformat() if trial_ends else None,
            "subscription_paid_until": paid_until.isoformat(),
            "warning_level": None,
            "warning_message": None,
        }

    if tenant.status == "suspended":
        return {
            "status": "suspended",
            "plan_code": tenant.plan_code,
            "is_trial": False,
            "requires_plan_selection": True,
            "days_remaining": 0,
            "trial_ends_at": trial_ends.isoformat() if trial_ends else None,
            "subscription_paid_until": None,
            "warning_level": "suspended",
            "warning_message": "Your account is suspended. Please contact support.",
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
            "plan_code": tenant.plan_code,
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
        "plan_code": tenant.plan_code,
        "is_trial": False,
        "requires_plan_selection": True,
        "days_remaining": 0,
        "trial_ends_at": trial_ends.isoformat() if trial_ends else None,
        "subscription_paid_until": None,
        "warning_level": "expired",
        "warning_message": "Your free trial has ended. Choose a plan to continue using Kairos Bookings.",
    }


def tenant_has_active_access(tenant: Tenant, *, now: datetime | None = None) -> bool:
    return not subscription_status_payload(tenant, now=now)["requires_plan_selection"]


async def ensure_default_plans(session: AsyncSession) -> None:
    existing = (await session.execute(select(SubscriptionPlan))).scalars().all()
    existing_codes = {plan.code for plan in existing}
    for plan in DEFAULT_PLANS:
        if plan["code"] in existing_codes:
            continue
        session.add(
            SubscriptionPlan(
                code=plan["code"],
                name=plan["name"],
                monthly_price=plan["monthly_price"],
                description=plan.get("description"),
                features=plan.get("features", []),
                entitlements=plan["entitlements"],
                self_serve=plan.get("self_serve", False),
                is_active=plan.get("is_active", True),
                is_featured=plan.get("is_featured", False),
                sort_order=plan.get("sort_order", 0),
            )
        )
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
    plan_code: str,
    *,
    now: datetime | None = None,
) -> dict:
    plan = (
        await session.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.code == plan_code,
                SubscriptionPlan.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not plan:
        raise ValueError("Unknown subscription plan")
    if not plan.self_serve:
        raise ValueError("This plan requires sales assistance. Please contact us for Enterprise pricing.")

    now = now or datetime.now(UTC)
    tenant.plan_code = plan_code
    tenant.status = "active"
    tenant.subscription_paid_until = now + timedelta(days=30)
    tenant.trial_warning_sent_at = None
    await session.commit()
    await session.refresh(tenant)
    return subscription_status_payload(tenant, now=now)


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
