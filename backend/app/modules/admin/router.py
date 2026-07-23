"""Platform admin metrics and subscriber management endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_roles
from app.infra.db import get_db_session
from app.infra.models import (
    AvailabilityRule,
    Booking,
    Client,
    EmailVerificationToken,
    PaymentStatus,
    PaymentTransaction,
    RefreshToken,
    Service,
    SubscriptionPlan,
    Tenant,
    User,
    UserRole,
)
from app.modules.subscriptions.service import list_admin_plans, serialize_plan
from app.schemas.subscriptions import CreatePlanRequest, UpdatePlanRequest

router = APIRouter()


@router.get("/metrics")
async def get_platform_metrics(
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant_count = (await session.execute(select(func.count(Tenant.id)))).scalar_one()
    booking_count = (await session.execute(select(func.count(Booking.id)))).scalar_one()
    booking_gmv = (
        await session.execute(
            select(func.coalesce(func.sum(PaymentTransaction.amount), 0)).where(
                PaymentTransaction.status == PaymentStatus.succeeded,
                PaymentTransaction.purpose == "booking",
            )
        )
    ).scalar_one()
    platform_fee_earned = (
        await session.execute(
            select(func.coalesce(func.sum(PaymentTransaction.platform_fee_amount), 0)).where(
                PaymentTransaction.status == PaymentStatus.succeeded,
                PaymentTransaction.purpose == "booking",
            )
        )
    ).scalar_one()
    subscription_revenue = (
        await session.execute(
            select(func.coalesce(func.sum(PaymentTransaction.amount), 0)).where(
                PaymentTransaction.status == PaymentStatus.succeeded,
                PaymentTransaction.purpose == "subscription",
            )
        )
    ).scalar_one()
    active_count = (
        await session.execute(select(func.count(Tenant.id)).where(Tenant.status == "active"))
    ).scalar_one()
    trial_count = (
        await session.execute(select(func.count(Tenant.id)).where(Tenant.status == "trial"))
    ).scalar_one()
    suspended_count = (
        await session.execute(select(func.count(Tenant.id)).where(Tenant.status == "suspended"))
    ).scalar_one()
    return {
        "tenants": tenant_count,
        "bookings": booking_count,
        "mrr": float(subscription_revenue),
        "booking_gmv": float(booking_gmv),
        "platform_fee_earned": float(platform_fee_earned),
        "active_tenants": active_count,
        "trial_tenants": trial_count,
        "suspended_tenants": suspended_count,
    }


@router.get("/subscribers")
async def list_subscribers(
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    tenants = (await session.execute(select(Tenant).order_by(Tenant.created_at.desc()))).scalars()
    return [
        {
            "id": tenant.id,
            "name": tenant.name,
            "business_type": tenant.business_type,
            "location": tenant.location,
            "status": tenant.status,
            "plan_code": tenant.plan_code,
            "public_slug": tenant.public_slug,
            "created_at": tenant.created_at,
            "onboarding_completed": tenant.onboarding_completed,
            "owner": (
                await session.execute(
                    select(User.full_name).where(
                        User.tenant_id == tenant.id, User.role.in_([UserRole.tenant_admin, UserRole.tenant_user])
                    )
                )
            ).scalar_one_or_none(),
            "owner_email": (
                await session.execute(
                    select(User.email).where(
                        User.tenant_id == tenant.id, User.role.in_([UserRole.tenant_admin, UserRole.tenant_user])
                    )
                )
            ).scalar_one_or_none(),
        }
        for tenant in tenants
    ]


@router.patch("/subscribers/{tenant_id}")
async def update_subscriber(
    tenant_id: str,
    payload: dict,
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        return {"ok": False}
    if "status" in payload:
        tenant.status = payload["status"]
    if "plan_code" in payload:
        tenant.plan_code = payload["plan_code"]
    if "name" in payload:
        tenant.name = payload["name"]
    if "location" in payload:
        tenant.location = payload["location"]
    await session.commit()
    return {"ok": True}


@router.delete("/subscribers/{tenant_id}")
async def delete_subscriber(
    tenant_id: str,
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        return {"ok": False}

    user_ids = (
        await session.execute(select(User.id).where(User.tenant_id == tenant_id))
    ).scalars().all()
    if user_ids:
        await session.execute(delete(EmailVerificationToken).where(EmailVerificationToken.user_id.in_(user_ids)))
        await session.execute(delete(RefreshToken).where(RefreshToken.user_id.in_(user_ids)))
    await session.execute(delete(PaymentTransaction).where(PaymentTransaction.tenant_id == tenant_id))
    await session.execute(delete(Booking).where(Booking.tenant_id == tenant_id))
    await session.execute(delete(Client).where(Client.tenant_id == tenant_id))
    await session.execute(delete(Service).where(Service.tenant_id == tenant_id))
    await session.execute(delete(AvailabilityRule).where(AvailabilityRule.tenant_id == tenant_id))
    await session.execute(delete(User).where(User.tenant_id == tenant_id))
    await session.execute(delete(Tenant).where(Tenant.id == tenant_id))
    await session.commit()
    return {"ok": True}


@router.get("/plans")
async def list_subscription_plans(
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    return await list_admin_plans(session)


@router.post("/plans")
async def create_subscription_plan(
    payload: CreatePlanRequest,
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    existing = (
        await session.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == payload.code))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="A plan with this code already exists")

    plan = SubscriptionPlan(
        code=payload.code,
        name=payload.name,
        monthly_price=payload.monthly_price,
        description=payload.description,
        features=payload.features,
        entitlements=payload.entitlements.model_dump(),
        self_serve=payload.self_serve,
        is_active=payload.is_active,
        is_featured=payload.is_featured,
        sort_order=payload.sort_order,
    )
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return serialize_plan(plan, include_admin_fields=True)


@router.patch("/plans/{plan_code}")
async def update_subscription_plan(
    plan_code: str,
    payload: UpdatePlanRequest,
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    plan = (
        await session.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == plan_code))
    ).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    updates = payload.model_dump(exclude_unset=True)
    if "entitlements" in updates and updates["entitlements"] is not None:
        updates["entitlements"] = payload.entitlements.model_dump() if payload.entitlements else {}

    for field, value in updates.items():
        setattr(plan, field, value)

    await session.commit()
    await session.refresh(plan)
    return serialize_plan(plan, include_admin_fields=True)


@router.delete("/plans/{plan_code}")
async def delete_subscription_plan(
    plan_code: str,
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    plan = (
        await session.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == plan_code))
    ).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    tenant_count = (
        await session.execute(select(func.count(Tenant.id)).where(Tenant.plan_code == plan_code))
    ).scalar_one()
    if tenant_count:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a plan that is assigned to tenants. Deactivate it instead.",
        )

    await session.delete(plan)
    await session.commit()
    return {"ok": True}
