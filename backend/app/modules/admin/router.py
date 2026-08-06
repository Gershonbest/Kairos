"""Platform admin metrics, subscribers, plans, and payment logs."""

from datetime import datetime
from hashlib import sha1

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import String, and_, case, cast, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, require_roles
from app.infra.cache import redis_cache
from app.infra.db import get_db_session
from app.infra.models import (
    AvailabilityRule,
    Booking,
    Client,
    EmailVerificationToken,
    PasswordResetToken,
    PaymentStatus,
    PaymentTransaction,
    RefreshToken,
    Service,
    SubscriptionPlan,
    Tenant,
    User,
    UserRole,
    WebhookEvent,
)
from app.modules.audit.service import record_audit_event
from app.modules.subscriptions.service import grant_plan_to_tenant, list_admin_plans, serialize_plan
from app.schemas.subscriptions import CreatePlanRequest, UpdatePlanRequest

router = APIRouter()


def _cache_token(*parts: object) -> str:
    raw = "|".join("" if part is None else str(part) for part in parts)
    return sha1(raw.encode("utf-8")).hexdigest()[:16]


def _serialize_payment_row(
    tx: PaymentTransaction,
    *,
    tenant_name: str | None = None,
    client_name: str | None = None,
    client_email: str | None = None,
    client_phone: str | None = None,
) -> dict:
    return {
        "id": tx.id,
        "tenant_id": tx.tenant_id,
        "tenant_name": tenant_name,
        "booking_id": tx.booking_id,
        "purpose": tx.purpose,
        "status": tx.status.value if hasattr(tx.status, "value") else str(tx.status),
        "amount": float(tx.amount),
        "platform_fee_amount": float(tx.platform_fee_amount) if tx.platform_fee_amount is not None else None,
        "tenant_settlement_amount": (
            float(tx.tenant_settlement_amount) if tx.tenant_settlement_amount is not None else None
        ),
        "currency": tx.currency,
        "provider": tx.provider,
        "provider_reference": tx.provider_reference,
        "paid_at": tx.paid_at.isoformat() if tx.paid_at else None,
        "created_at": tx.created_at.isoformat() if tx.created_at else None,
        "client_name": client_name,
        "client_email": client_email,
        "client_phone": client_phone,
    }


@router.get("/metrics")
async def get_platform_metrics(
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    cache_key = redis_cache.admin_key("metrics")
    cached = await redis_cache.get_json(cache_key)
    if cached is not None:
        return cached

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
    payload = {
        "tenants": tenant_count,
        "bookings": booking_count,
        "mrr": float(subscription_revenue),
        "booking_gmv": float(booking_gmv),
        "platform_fee_earned": float(platform_fee_earned),
        "active_tenants": active_count,
        "trial_tenants": trial_count,
        "suspended_tenants": suspended_count,
    }
    await redis_cache.set_json(cache_key, payload)
    return payload


@router.get("/subscribers")
async def list_subscribers(
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    cache_key = redis_cache.admin_key("subscribers")
    cached = await redis_cache.get_json(cache_key)
    if cached is not None:
        return cached

    owner_rank = (
        func.row_number()
        .over(
            partition_by=User.tenant_id,
            order_by=(
                case((User.role == UserRole.tenant_admin, 0), else_=1),
                User.created_at.asc(),
            ),
        )
        .label("owner_rank")
    )
    owners_subq = (
        select(
            User.tenant_id.label("tenant_id"),
            User.full_name.label("owner"),
            User.email.label("owner_email"),
            owner_rank,
        )
        .where(User.role.in_([UserRole.tenant_admin, UserRole.tenant_user]))
        .subquery()
    )
    owners = (
        select(
            owners_subq.c.tenant_id,
            owners_subq.c.owner,
            owners_subq.c.owner_email,
        )
        .where(owners_subq.c.owner_rank == 1)
        .subquery()
    )

    rows = (
        await session.execute(
            select(Tenant, owners.c.owner, owners.c.owner_email)
            .outerjoin(owners, owners.c.tenant_id == Tenant.id)
            .order_by(Tenant.created_at.desc())
        )
    ).all()

    payload = [
        {
            "id": tenant.id,
            "name": tenant.name,
            "business_type": tenant.business_type,
            "location": tenant.location,
            "status": tenant.status,
            "plan_code": tenant.plan_code,
            "public_slug": tenant.public_slug,
            "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
            "onboarding_completed": tenant.onboarding_completed,
            "owner": owner,
            "owner_email": owner_email,
        }
        for tenant, owner, owner_email in rows
    ]
    await redis_cache.set_json(cache_key, payload)
    return payload


@router.patch("/subscribers/{tenant_id}")
async def update_subscriber(
    tenant_id: str,
    payload: dict,
    request: Request,
    actor: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        return {"ok": False}

    before = {
        "status": tenant.status,
        "plan_code": tenant.plan_code,
        "name": tenant.name,
        "location": tenant.location,
        "subscription_paid_until": (
            tenant.subscription_paid_until.isoformat() if tenant.subscription_paid_until else None
        ),
    }
    changes: dict = {}
    grant_meta: dict | None = None

    if "status" in payload and payload["status"] != tenant.status:
        tenant.status = payload["status"]
        changes["status"] = {"from": before["status"], "to": tenant.status}
    if "plan_code" in payload and payload["plan_code"] != tenant.plan_code:
        # Complimentary admin grant: assign plan + activate paid access (no charge).
        grant_days = int(payload.get("grant_days") or 30)
        try:
            grant_meta = await grant_plan_to_tenant(
                session,
                tenant,
                payload["plan_code"],
                days=grant_days,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        changes["plan_code"] = {"from": before["plan_code"], "to": tenant.plan_code}
        changes["status"] = {"from": before["status"], "to": tenant.status}
        changes["subscription_paid_until"] = {
            "from": before["subscription_paid_until"],
            "to": tenant.subscription_paid_until.isoformat() if tenant.subscription_paid_until else None,
        }
        changes["grant_days"] = grant_days
    if "name" in payload and payload["name"] != tenant.name:
        tenant.name = payload["name"]
        changes["name"] = {"from": before["name"], "to": tenant.name}
    if "location" in payload and payload["location"] != tenant.location:
        tenant.location = payload["location"]
        changes["location"] = {"from": before["location"], "to": tenant.location}

    if changes:
        action = "tenant.updated"
        if grant_meta is not None:
            action = "tenant.plan_grant"
        elif "status" in changes and set(changes.keys()) == {"status"}:
            new_status = changes["status"]["to"]
            if new_status == "suspended":
                action = "tenant.suspend"
            elif before["status"] == "suspended":
                action = "tenant.reactivate"

        await record_audit_event(
            session,
            action=action,
            entity_type="tenant",
            entity_id=tenant.id,
            tenant_id=tenant.id,
            actor=actor,
            metadata={"before": before, "changes": changes, "grant": grant_meta},
            request=request,
        )

    await session.commit()
    await redis_cache.invalidate_tenant(
        tenant_id,
        "tenant:me",
        "booking-links",
        "payment-provider",
        "dashboard:summary",
    )
    await redis_cache.invalidate_admin_overview()
    return {
        "ok": True,
        "plan_code": tenant.plan_code,
        "status": tenant.status,
        "subscription_paid_until": (
            tenant.subscription_paid_until.isoformat() if tenant.subscription_paid_until else None
        ),
    }


@router.delete("/subscribers/{tenant_id}")
async def delete_subscriber(
    tenant_id: str,
    request: Request,
    actor: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        return {"ok": False}

    await record_audit_event(
        session,
        action="tenant.delete",
        entity_type="tenant",
        entity_id=tenant.id,
        tenant_id=tenant.id,
        actor=actor,
        metadata={
            "name": tenant.name,
            "status": tenant.status,
            "plan_code": tenant.plan_code,
            "public_slug": tenant.public_slug,
        },
        request=request,
    )

    user_ids = (
        await session.execute(select(User.id).where(User.tenant_id == tenant_id))
    ).scalars().all()
    if user_ids:
        await session.execute(delete(EmailVerificationToken).where(EmailVerificationToken.user_id.in_(user_ids)))
        await session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id.in_(user_ids)))
        await session.execute(delete(RefreshToken).where(RefreshToken.user_id.in_(user_ids)))
    await session.execute(delete(PaymentTransaction).where(PaymentTransaction.tenant_id == tenant_id))
    await session.execute(delete(Booking).where(Booking.tenant_id == tenant_id))
    await session.execute(delete(Client).where(Client.tenant_id == tenant_id))
    await session.execute(delete(Service).where(Service.tenant_id == tenant_id))
    await session.execute(delete(AvailabilityRule).where(AvailabilityRule.tenant_id == tenant_id))
    await session.execute(delete(User).where(User.tenant_id == tenant_id))
    await session.execute(delete(Tenant).where(Tenant.id == tenant_id))
    await session.commit()
    await redis_cache.invalidate_admin_overview()
    await redis_cache.invalidate_admin_payments()
    return {"ok": True}


@router.get("/plans")
async def list_subscription_plans(
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    cache_key = redis_cache.admin_key("plans")
    cached = await redis_cache.get_json(cache_key)
    if cached is not None:
        return cached
    payload = await list_admin_plans(session)
    await redis_cache.set_json(cache_key, payload)
    return payload


@router.post("/plans")
async def create_subscription_plan(
    payload: CreatePlanRequest,
    request: Request,
    actor: CurrentUser = Depends(require_roles("platform_admin")),
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
    await session.flush()
    await record_audit_event(
        session,
        action="plan.create",
        entity_type="subscription_plan",
        entity_id=plan.id,
        actor=actor,
        metadata={"code": plan.code, "name": plan.name, "monthly_price": float(plan.monthly_price)},
        request=request,
    )
    await session.commit()
    await session.refresh(plan)
    await redis_cache.invalidate_admin("plans")
    return serialize_plan(plan, include_admin_fields=True)


@router.patch("/plans/{plan_code}")
async def update_subscription_plan(
    plan_code: str,
    payload: UpdatePlanRequest,
    request: Request,
    actor: CurrentUser = Depends(require_roles("platform_admin")),
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

    before = {}
    for field in updates:
        value = getattr(plan, field)
        if hasattr(value, "as_integer_ratio"):
            before[field] = float(value)
        else:
            before[field] = value
    for field, value in updates.items():
        setattr(plan, field, value)

    await record_audit_event(
        session,
        action="plan.update",
        entity_type="subscription_plan",
        entity_id=plan.id,
        actor=actor,
        metadata={"code": plan.code, "before": before, "updates": list(updates.keys())},
        request=request,
    )
    await session.commit()
    await session.refresh(plan)
    await redis_cache.invalidate_admin("plans")
    return serialize_plan(plan, include_admin_fields=True)


@router.delete("/plans/{plan_code}")
async def delete_subscription_plan(
    plan_code: str,
    request: Request,
    actor: CurrentUser = Depends(require_roles("platform_admin")),
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

    await record_audit_event(
        session,
        action="plan.delete",
        entity_type="subscription_plan",
        entity_id=plan.id,
        actor=actor,
        metadata={"code": plan.code, "name": plan.name},
        request=request,
    )
    await session.delete(plan)
    await session.commit()
    await redis_cache.invalidate_admin("plans")
    return {"ok": True}


def _date_filters(date_from: datetime | None, date_to: datetime | None) -> list:
    filters = []
    if date_from:
        filters.append(PaymentTransaction.created_at >= date_from)
    if date_to:
        filters.append(PaymentTransaction.created_at <= date_to)
    return filters


def _succeeded_sum(column):
    return func.coalesce(
        func.sum(case((PaymentTransaction.status == PaymentStatus.succeeded, column), else_=0)), 0
    )


@router.get("/payments/summary")
async def get_payment_summary(
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
) -> dict:
    """Split platform money into client booking payments vs subscription fees."""
    cache_key = redis_cache.admin_key(
        f"payments:summary:{_cache_token(tenant_id, date_from, date_to)}"
    )
    cached = await redis_cache.get_json(cache_key)
    if cached is not None:
        return cached

    base_filters = _date_filters(date_from, date_to)
    if tenant_id:
        base_filters.append(PaymentTransaction.tenant_id == tenant_id)

    async def totals_for(purpose: str) -> dict:
        stmt = select(
            func.count(PaymentTransaction.id).label("transactions"),
            _succeeded_sum(PaymentTransaction.amount).label("gross"),
            _succeeded_sum(PaymentTransaction.platform_fee_amount).label("platform_fee"),
            _succeeded_sum(PaymentTransaction.tenant_settlement_amount).label("settlement"),
            func.count(
                case((PaymentTransaction.status == PaymentStatus.succeeded, PaymentTransaction.id))
            ).label("succeeded"),
            func.count(
                case((PaymentTransaction.status == PaymentStatus.pending, PaymentTransaction.id))
            ).label("pending"),
            func.count(
                case((PaymentTransaction.status == PaymentStatus.failed, PaymentTransaction.id))
            ).label("failed"),
            func.count(
                case((PaymentTransaction.status == PaymentStatus.refunded, PaymentTransaction.id))
            ).label("refunded"),
        ).where(PaymentTransaction.purpose == purpose, *base_filters)
        row = (await session.execute(stmt)).one()
        return {
            "transactions": int(row.transactions or 0),
            "gross": float(row.gross or 0),
            "platform_fee": float(row.platform_fee or 0),
            "settlement": float(row.settlement or 0),
            "succeeded": int(row.succeeded or 0),
            "pending": int(row.pending or 0),
            "failed": int(row.failed or 0),
            "refunded": int(row.refunded or 0),
        }

    booking = await totals_for("booking")
    subscription = await totals_for("subscription")

    paying_clients = (
        await session.execute(
            select(func.count(func.distinct(Booking.client_id)))
            .select_from(PaymentTransaction)
            .join(Booking, Booking.id == PaymentTransaction.booking_id)
            .where(
                PaymentTransaction.purpose == "booking",
                PaymentTransaction.status == PaymentStatus.succeeded,
                *base_filters,
            )
        )
    ).scalar_one()

    businesses_collecting = (
        await session.execute(
            select(func.count(func.distinct(PaymentTransaction.tenant_id))).where(
                PaymentTransaction.purpose == "booking",
                PaymentTransaction.status == PaymentStatus.succeeded,
                *base_filters,
            )
        )
    ).scalar_one()

    booking["paying_clients"] = int(paying_clients or 0)
    booking["businesses_collecting"] = int(businesses_collecting or 0)
    payload = {"booking": booking, "subscription": subscription}
    await redis_cache.set_json(cache_key, payload)
    return payload


@router.get("/payments/by-tenant")
async def list_payments_by_tenant(
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
) -> list[dict]:
    """Per-business rollup of what that business's clients have paid."""
    cache_key = redis_cache.admin_key(f"payments:by-tenant:{_cache_token(date_from, date_to)}")
    cached = await redis_cache.get_json(cache_key)
    if cached is not None:
        return cached

    stmt = (
        select(
            Tenant.id.label("tenant_id"),
            Tenant.name.label("tenant_name"),
            Tenant.status.label("tenant_status"),
            Tenant.plan_code.label("plan_code"),
            func.count(PaymentTransaction.id).label("transactions"),
            func.count(func.distinct(Booking.client_id)).label("clients"),
            _succeeded_sum(PaymentTransaction.amount).label("gross"),
            _succeeded_sum(PaymentTransaction.platform_fee_amount).label("platform_fee"),
            _succeeded_sum(PaymentTransaction.tenant_settlement_amount).label("settlement"),
            func.count(
                case((PaymentTransaction.status == PaymentStatus.pending, PaymentTransaction.id))
            ).label("pending"),
            func.count(
                case((PaymentTransaction.status == PaymentStatus.failed, PaymentTransaction.id))
            ).label("failed"),
            func.max(PaymentTransaction.paid_at).label("last_payment_at"),
        )
        .join(PaymentTransaction, PaymentTransaction.tenant_id == Tenant.id)
        .outerjoin(Booking, Booking.id == PaymentTransaction.booking_id)
        .where(PaymentTransaction.purpose == "booking", *_date_filters(date_from, date_to))
        .group_by(Tenant.id, Tenant.name, Tenant.status, Tenant.plan_code)
        .order_by(_succeeded_sum(PaymentTransaction.amount).desc())
    )
    rows = (await session.execute(stmt)).all()
    payload = [
        {
            "tenant_id": row.tenant_id,
            "tenant_name": row.tenant_name,
            "tenant_status": row.tenant_status,
            "plan_code": row.plan_code,
            "transactions": int(row.transactions or 0),
            "clients": int(row.clients or 0),
            "gross": float(row.gross or 0),
            "platform_fee": float(row.platform_fee or 0),
            "settlement": float(row.settlement or 0),
            "pending": int(row.pending or 0),
            "failed": int(row.failed or 0),
            "last_payment_at": row.last_payment_at.isoformat() if row.last_payment_at else None,
        }
        for row in rows
    ]
    await redis_cache.set_json(cache_key, payload)
    return payload


@router.get("/payments/tenant/{tenant_id}/clients")
async def list_tenant_client_payments(
    tenant_id: str,
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
) -> list[dict]:
    """Client-level payment rollup for one business."""
    cache_key = redis_cache.admin_key(
        f"payments:tenant-clients:{_cache_token(tenant_id, date_from, date_to)}"
    )
    cached = await redis_cache.get_json(cache_key)
    if cached is not None:
        return cached

    stmt = (
        select(
            Client.id.label("client_id"),
            Client.full_name.label("client_name"),
            Client.email.label("client_email"),
            Client.phone.label("client_phone"),
            func.count(PaymentTransaction.id).label("transactions"),
            _succeeded_sum(PaymentTransaction.amount).label("paid"),
            func.count(
                case((PaymentTransaction.status == PaymentStatus.pending, PaymentTransaction.id))
            ).label("pending"),
            func.count(
                case((PaymentTransaction.status == PaymentStatus.failed, PaymentTransaction.id))
            ).label("failed"),
            func.max(PaymentTransaction.paid_at).label("last_payment_at"),
        )
        .select_from(PaymentTransaction)
        .join(Booking, Booking.id == PaymentTransaction.booking_id)
        .join(Client, Client.id == Booking.client_id)
        .where(
            PaymentTransaction.tenant_id == tenant_id,
            PaymentTransaction.purpose == "booking",
            *_date_filters(date_from, date_to),
        )
        .group_by(Client.id, Client.full_name, Client.email, Client.phone)
        .order_by(_succeeded_sum(PaymentTransaction.amount).desc())
    )
    rows = (await session.execute(stmt)).all()
    payload = [
        {
            "client_id": row.client_id,
            "client_name": row.client_name,
            "client_email": row.client_email,
            "client_phone": row.client_phone,
            "transactions": int(row.transactions or 0),
            "paid": float(row.paid or 0),
            "pending": int(row.pending or 0),
            "failed": int(row.failed or 0),
            "last_payment_at": row.last_payment_at.isoformat() if row.last_payment_at else None,
        }
        for row in rows
    ]
    await redis_cache.set_json(cache_key, payload)
    return payload


@router.get("/payments")
async def list_payment_logs(
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
    q: str | None = Query(default=None),
    tenant_id: str | None = Query(default=None),
    purpose: str | None = Query(default=None),
    status: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
) -> dict:
    cache_key = redis_cache.admin_key(
        f"payments:list:{_cache_token(q, tenant_id, purpose, status, date_from, date_to, page, page_size)}"
    )
    cached = await redis_cache.get_json(cache_key)
    if cached is not None:
        return cached

    filters = []
    if tenant_id:
        filters.append(PaymentTransaction.tenant_id == tenant_id)
    if purpose:
        filters.append(PaymentTransaction.purpose == purpose)
    if status:
        try:
            filters.append(PaymentTransaction.status == PaymentStatus(status))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid payment status") from exc
    if date_from:
        filters.append(PaymentTransaction.created_at >= date_from)
    if date_to:
        filters.append(PaymentTransaction.created_at <= date_to)

    stmt = (
        select(
            PaymentTransaction,
            Tenant.name.label("tenant_name"),
            Client.full_name.label("client_name"),
            Client.email.label("client_email"),
            Client.phone.label("client_phone"),
        )
        .join(Tenant, Tenant.id == PaymentTransaction.tenant_id)
        .outerjoin(Booking, Booking.id == PaymentTransaction.booking_id)
        .outerjoin(Client, Client.id == Booking.client_id)
    )

    if q:
        like = f"%{q.strip()}%"
        filters.append(
            or_(
                PaymentTransaction.provider_reference.ilike(like),
                PaymentTransaction.id.ilike(like),
                Tenant.name.ilike(like),
                Client.full_name.ilike(like),
                Client.email.ilike(like),
                Client.phone.ilike(like),
            )
        )

    if filters:
        stmt = stmt.where(and_(*filters))

    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    rows = (
        await session.execute(
            stmt.order_by(PaymentTransaction.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    items = [
        _serialize_payment_row(
            tx,
            tenant_name=tenant_name,
            client_name=client_name,
            client_email=client_email,
            client_phone=client_phone,
        )
        for tx, tenant_name, client_name, client_email, client_phone in rows
    ]
    payload = {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
    await redis_cache.set_json(cache_key, payload)
    return payload


@router.get("/payments/{transaction_id}")
async def get_payment_log_detail(
    transaction_id: str,
    _: CurrentUser = Depends(require_roles("platform_admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    cache_key = redis_cache.admin_key(f"payments:detail:{transaction_id}")
    cached = await redis_cache.get_json(cache_key)
    if cached is not None:
        return cached

    tx = (
        await session.execute(select(PaymentTransaction).where(PaymentTransaction.id == transaction_id))
    ).scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Payment transaction not found")

    tenant = (await session.execute(select(Tenant).where(Tenant.id == tx.tenant_id))).scalar_one_or_none()

    booking_payload = None
    client_name = client_email = client_phone = None
    if tx.booking_id:
        booking = (
            await session.execute(
                select(Booking)
                .options(selectinload(Booking.client), selectinload(Booking.service))
                .where(Booking.id == tx.booking_id)
            )
        ).scalar_one_or_none()
        if booking:
            client = booking.client
            service = booking.service
            client_name = client.full_name if client else None
            client_email = client.email if client else None
            client_phone = client.phone if client else None
            booking_payload = {
                "id": booking.id,
                "status": booking.status.value if hasattr(booking.status, "value") else str(booking.status),
                "start_at": booking.start_at.isoformat() if booking.start_at else None,
                "end_at": booking.end_at.isoformat() if booking.end_at else None,
                "notes": booking.notes,
                "service": (
                    {
                        "id": service.id,
                        "name": service.name,
                        "price_amount": float(service.price_amount),
                        "deposit_amount": float(service.deposit_amount) if service.deposit_amount is not None else None,
                    }
                    if service
                    else None
                ),
                "client": (
                    {
                        "id": client.id,
                        "full_name": client.full_name,
                        "email": client.email,
                        "phone": client.phone,
                    }
                    if client
                    else None
                ),
            }

    owner_email = None
    owner_name = None
    if tenant:
        owner = (
            await session.execute(
                select(User).where(
                    User.tenant_id == tenant.id,
                    User.role.in_([UserRole.tenant_admin, UserRole.tenant_user]),
                ).limit(1)
            )
        ).scalar_one_or_none()
        if owner:
            owner_email = owner.email
            owner_name = owner.full_name

    webhooks = (
        await session.execute(
            select(WebhookEvent)
            .where(cast(WebhookEvent.payload, String).ilike(f"%{tx.provider_reference}%"))
            .order_by(WebhookEvent.created_at.desc())
            .limit(20)
        )
    ).scalars().all()

    payload = {
        **_serialize_payment_row(
            tx,
            tenant_name=tenant.name if tenant else None,
            client_name=client_name,
            client_email=client_email,
            client_phone=client_phone,
        ),
        "idempotency_key": tx.idempotency_key,
        "authorization_url": tx.authorization_url,
        "access_code": tx.access_code,
        "tenant": (
            {
                "id": tenant.id,
                "name": tenant.name,
                "status": tenant.status,
                "plan_code": tenant.plan_code,
                "public_slug": tenant.public_slug,
                "help_email": tenant.help_email,
                "phone_number": tenant.phone_number,
                "location": tenant.location,
                "paystack_subaccount_id": tenant.paystack_subaccount_id,
                "settlement_account_last4": tenant.settlement_account_last4,
                "owner_name": owner_name,
                "owner_email": owner_email,
            }
            if tenant
            else None
        ),
        "booking": booking_payload,
        "webhooks": [
            {
                "id": event.id,
                "provider": event.provider,
                "event_id": event.event_id,
                "processed": event.processed,
                "attempts": event.attempts,
                "next_attempt_at": event.next_attempt_at.isoformat() if event.next_attempt_at else None,
                "created_at": event.created_at.isoformat() if event.created_at else None,
                "payload": event.payload,
            }
            for event in webhooks
        ],
        "timeline": [
            {"label": "Created", "at": tx.created_at.isoformat() if tx.created_at else None},
            {"label": "Paid", "at": tx.paid_at.isoformat() if tx.paid_at else None},
            *[
                {
                    "label": f"Webhook {'processed' if event.processed else 'received'}",
                    "at": event.created_at.isoformat() if event.created_at else None,
                    "event_id": event.event_id,
                    "processed": event.processed,
                }
                for event in webhooks
            ],
        ],
    }
    await redis_cache.set_json(cache_key, payload)
    return payload
