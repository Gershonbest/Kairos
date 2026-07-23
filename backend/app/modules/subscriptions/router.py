"""Subscription plans, trial status, and plan activation."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user
from app.infra.db import get_db_session
from app.infra.models import Tenant, User
from app.modules.subscriptions.service import (
    activate_plan,
    create_subscription_checkout,
    list_public_plans,
    maybe_send_trial_warning,
    subscription_status_payload,
)
from app.schemas.subscriptions import ActivatePlanRequest

router = APIRouter()


@router.get("/plans")
async def list_plans(session: AsyncSession = Depends(get_db_session)) -> list[dict]:
    return await list_public_plans(session)


@router.get("/status")
async def get_subscription_status(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    tenant = (await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one()
    owner = (await session.execute(select(User).where(User.id == current_user.id))).scalar_one_or_none()
    await maybe_send_trial_warning(session, tenant, owner)
    return subscription_status_payload(tenant)


@router.post("/checkout")
async def checkout_subscription_plan(
    payload: ActivatePlanRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    tenant = (await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one()
    owner = (await session.execute(select(User).where(User.id == current_user.id))).scalar_one()
    try:
        return await create_subscription_checkout(
            session, tenant=tenant, owner=owner, plan_code=payload.plan_code
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/activate")
async def activate_subscription_plan(
    payload: ActivatePlanRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Legacy simulated activation — prefer /checkout when Paystack is configured."""
    from app.infra.paystack import paystack_client

    if paystack_client.is_configured():
        raise HTTPException(
            status_code=400,
            detail="Use POST /subscriptions/checkout to pay with Paystack",
        )

    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    tenant = (await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one()
    try:
        return await activate_plan(session, tenant, payload.plan_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
