"""Tenant profile, onboarding, and booking link endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import Service, Tenant, User
from app.modules.tenants.helpers import branches_to_dict, tenant_display_location
from app.modules.subscriptions.service import start_tenant_trial
from app.schemas.tenants import TenantOnboardingUpdate, TenantPublicProfileUpdate

router = APIRouter()
settings = get_settings()


class PaymentProviderConnectRequest(BaseModel):
    provider: str = Field(pattern="^(stripe|paystack|flutterwave)$")
    account_id: str | None = None
    api_key: str | None = None


def _tenant_payload(tenant: Tenant) -> dict:
    return {
        "id": tenant.id,
        "name": tenant.name,
        "business_type": tenant.business_type,
        "location": tenant_display_location(tenant),
        "country_code": tenant.country_code,
        "state": tenant.state,
        "address_line": tenant.address_line,
        "phone_country_code": tenant.phone_country_code,
        "phone_number": tenant.phone_number,
        "latitude": float(tenant.latitude) if tenant.latitude is not None else None,
        "longitude": float(tenant.longitude) if tenant.longitude is not None else None,
        "branches": tenant.branches or [],
        "status": tenant.status,
        "plan_code": tenant.plan_code,
        "public_slug": tenant.public_slug,
        "public_tagline": tenant.public_tagline,
        "public_description": tenant.public_description,
        "public_logo_url": tenant.public_logo_url,
        "onboarding_completed": tenant.onboarding_completed,
    }


@router.get("/me")
async def get_my_tenant(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one()
    return _tenant_payload(tenant)


@router.put("/me/onboarding")
async def complete_onboarding(
    payload: TenantOnboardingUpdate,
    current_user: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant: Tenant | None = None
    if current_user.tenant_id:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
        ).scalar_one_or_none()

    if not tenant:
        user = (await session.execute(select(User).where(User.id == current_user.id))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        tenant = Tenant(name=payload.business_name)
        start_tenant_trial(tenant)
        session.add(tenant)
        await session.flush()
        user.tenant_id = tenant.id

    tenant.name = payload.business_name
    tenant.business_type = payload.business_type
    tenant.country_code = payload.country_code.upper()
    tenant.state = payload.state
    tenant.address_line = payload.address_line
    tenant.phone_country_code = payload.phone_country_code
    tenant.phone_number = payload.phone_number
    tenant.latitude = payload.latitude
    tenant.longitude = payload.longitude
    tenant.location = payload.location
    tenant.branches = branches_to_dict(payload.branches)
    if payload.logo_url:
        tenant.public_logo_url = payload.logo_url
    tenant.onboarding_completed = True
    if not tenant.public_slug:
        tenant.public_slug = f"{tenant.name.strip().lower().replace(' ', '-')}-{tenant.id[:8]}"
    await session.commit()
    return {"ok": True}


@router.get("/me/booking-links")
async def get_booking_links(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one()
    tenant_key = tenant.public_slug or tenant.id
    base_link = f"{settings.public_booking_base_url}/{tenant_key}"
    services = (
        await session.execute(select(Service).where(Service.tenant_id == tenant.id, Service.active.is_(True)))
    ).scalars()
    service_links = [
        {
            "service_id": service.id,
            "service_name": service.name,
            "url": f"{base_link}?service={service.id}",
        }
        for service in services
    ]
    return {"business_url": base_link, "service_urls": service_links}


@router.put("/me/public-profile")
async def update_public_profile(
    payload: TenantPublicProfileUpdate,
    current_user: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant.public_tagline = payload.public_tagline
    tenant.public_description = payload.public_description
    tenant.public_logo_url = payload.public_logo_url
    await session.commit()
    return {"ok": True}


@router.post("/me/payment-provider")
async def connect_payment_provider(
    payload: PaymentProviderConnectRequest,
    current_user: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant.payment_provider = payload.provider
    tenant.payment_account_id = payload.account_id or None
    tenant.payments_enabled = True
    await session.commit()
    return {"ok": True}


@router.get("/me/payment-provider")
async def get_payment_provider(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "provider": tenant.payment_provider,
        "account_id": tenant.payment_account_id,
        "payments_enabled": tenant.payments_enabled,
    }
