"""Tenant profile, onboarding, and booking link endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import Service, Tenant, User
from app.infra.paystack import PaystackError, paystack_client
from app.modules.tenants.helpers import branches_to_dict, tenant_display_location
from app.modules.subscriptions.service import start_tenant_trial, tenant_allows_payment_processing
from app.schemas.tenants import TenantOnboardingUpdate, TenantProfileUpdate, TenantPublicProfileUpdate

router = APIRouter()
settings = get_settings()


class PaymentProviderConnectRequest(BaseModel):
    provider: str = Field(default="paystack", pattern="^paystack$")
    business_name: str | None = Field(default=None, min_length=2, max_length=200)
    settlement_bank: str = Field(min_length=2, max_length=20)
    account_number: str = Field(min_length=6, max_length=20)
    # Optional legacy fields ignored for Paystack.
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
        "help_email": tenant.help_email,
        "timezone": tenant.timezone or "Africa/Lagos",
        "onboarding_completed": tenant.onboarding_completed,
    }


async def _ensure_unique_slug(session: AsyncSession, slug: str, tenant_id: str) -> None:
    existing = (
        await session.execute(
            select(Tenant).where(Tenant.public_slug == slug, Tenant.id != tenant_id)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="That public booking URL is already taken")


@router.get("/me")
async def get_my_tenant(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one()
    return _tenant_payload(tenant)


@router.patch("/me")
async def update_my_tenant(
    payload: TenantProfileUpdate,
    current_user: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    data = payload.model_dump(exclude_unset=True)
    if "business_name" in data and data["business_name"] is not None:
        tenant.name = data["business_name"]
    if "business_type" in data:
        tenant.business_type = data["business_type"]
    if "country_code" in data and data["country_code"] is not None:
        tenant.country_code = data["country_code"]
    if "state" in data:
        tenant.state = data["state"]
    if "address_line" in data and data["address_line"] is not None:
        tenant.address_line = data["address_line"]
    if "phone_country_code" in data and data["phone_country_code"] is not None:
        tenant.phone_country_code = data["phone_country_code"]
    if "phone_number" in data and data["phone_number"] is not None:
        tenant.phone_number = data["phone_number"]
    if "latitude" in data:
        tenant.latitude = data["latitude"]
    if "longitude" in data:
        tenant.longitude = data["longitude"]
    if "logo_url" in data and data["logo_url"] is not None:
        tenant.public_logo_url = data["logo_url"]
    if "help_email" in data:
        tenant.help_email = data["help_email"]
    if "timezone" in data and data["timezone"] is not None:
        tenant.timezone = data["timezone"]
    if "branches" in data and data["branches"] is not None:
        tenant.branches = branches_to_dict(payload.branches or [])
    if "public_slug" in data and data["public_slug"] is not None:
        await _ensure_unique_slug(session, data["public_slug"], tenant.id)
        tenant.public_slug = data["public_slug"]

    if "location" in data and data["location"] is not None:
        tenant.location = data["location"]
    elif any(k in data for k in ("address_line", "state", "country_code")):
        tenant.location = ", ".join(
            part
            for part in [
                tenant.address_line,
                tenant.state,
                (tenant.country_code or "").upper(),
            ]
            if part
        )

    await session.commit()
    await session.refresh(tenant)
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
    tenant.help_email = payload.help_email
    if payload.timezone:
        tenant.timezone = payload.timezone
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
    if payload.public_slug is not None:
        await _ensure_unique_slug(session, payload.public_slug, tenant.id)
        tenant.public_slug = payload.public_slug
    await session.commit()
    return {"ok": True}


@router.get("/me/paystack/banks")
async def list_paystack_banks(
    current_user: CurrentUser = Depends(require_active_subscription),
) -> list[dict]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    if not paystack_client.is_configured():
        raise HTTPException(status_code=503, detail="Paystack is not configured")
    try:
        banks = await paystack_client.list_banks()
    except PaystackError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [
        {"name": bank.get("name"), "code": bank.get("code"), "slug": bank.get("slug")}
        for bank in banks
        if bank.get("code") and bank.get("name")
    ]


@router.post("/me/payment-provider")
async def connect_payment_provider(
    payload: PaymentProviderConnectRequest,
    current_user: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if not await tenant_allows_payment_processing(session, tenant):
        raise HTTPException(
            status_code=403,
            detail="Payment processing requires a Premium plan or an active trial.",
        )
    if not paystack_client.is_configured():
        raise HTTPException(status_code=503, detail="Paystack is not configured on the server")

    owner = (await session.execute(select(User).where(User.id == current_user.id))).scalar_one_or_none()
    business_name = (payload.business_name or tenant.name or "Kairos Business").strip()
    fee_percent = float(settings.paystack_platform_fee_percent)

    try:
        subaccount = await paystack_client.create_subaccount(
            business_name=business_name,
            settlement_bank=payload.settlement_bank.strip(),
            account_number=payload.account_number.strip(),
            percentage_charge=fee_percent,
            primary_contact_email=owner.email if owner else None,
            primary_contact_name=owner.full_name if owner else None,
        )
    except PaystackError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    subaccount_code = subaccount.get("subaccount_code") or subaccount.get("id")
    if not subaccount_code:
        raise HTTPException(status_code=502, detail="Paystack did not return a subaccount code")

    tenant.payment_provider = "paystack"
    tenant.payment_account_id = str(subaccount_code)
    tenant.paystack_subaccount_id = str(subaccount.get("id") or "")
    tenant.settlement_bank_code = payload.settlement_bank.strip()
    tenant.settlement_account_last4 = payload.account_number.strip()[-4:]
    tenant.platform_fee_percent = fee_percent
    tenant.payments_enabled = True
    await session.commit()
    return {
        "ok": True,
        "provider": "paystack",
        "subaccount_code": tenant.payment_account_id,
        "platform_fee_percent": fee_percent,
        "payments_enabled": True,
    }


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
        "settlement_bank_code": tenant.settlement_bank_code,
        "settlement_account_last4": tenant.settlement_account_last4,
        "platform_fee_percent": float(tenant.platform_fee_percent)
        if tenant.platform_fee_percent is not None
        else float(settings.paystack_platform_fee_percent),
    }


@router.post("/me/deactivate")
async def deactivate_tenant(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    if current_user.role != "tenant_admin":
        raise HTTPException(status_code=403, detail="Only the business owner can deactivate this account")

    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    from app.infra.models import RefreshToken

    tenant.status = "inactive"
    users = (
        await session.execute(select(User).where(User.tenant_id == tenant.id))
    ).scalars().all()
    user_ids = [user.id for user in users]
    for user in users:
        user.is_active = False
    if user_ids:
        tokens = (
            await session.execute(select(RefreshToken).where(RefreshToken.user_id.in_(user_ids)))
        ).scalars().all()
        for token in tokens:
            token.revoked = True
    await session.commit()
    return {"ok": True, "status": "inactive"}

