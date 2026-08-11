"""Tenant service catalog CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.cache import redis_cache
from app.infra.db import get_db_session
from app.infra.models import (
    AppointmentType,
    Listing,
    SchedulingMode,
    Service,
    ServiceBookingType,
    Tenant,
)
from app.schemas.services import ServiceCreate, ServiceOut, ServiceUpdate

router = APIRouter(dependencies=[Depends(require_active_subscription)])

SERVICES_CACHE = "services:list"
BOOKINGS_CACHE = "bookings:list"


def _to_service_out(service: Service) -> ServiceOut:
    return ServiceOut(
        id=service.id,
        name=service.name,
        description=service.description,
        duration_minutes=service.duration_minutes,
        booking_type=service.booking_type.value,
        scheduling_mode=service.scheduling_mode.value,
        price_amount=float(service.price_amount),
        deposit_amount=float(service.deposit_amount) if service.deposit_amount is not None else None,
        appointment_type=service.appointment_type.value,
        location=service.location,
        use_business_location=service.use_business_location,
        host_name=service.host_name,
        host_title=service.host_title,
        online_meeting_link=service.online_meeting_link,
        client_instructions=service.client_instructions,
        buffer_minutes=service.buffer_minutes,
        image_url=service.image_url,
        active=service.active,
        listing_ids=[listing.id for listing in service.listings],
    )


def _apply_service_payload(service: Service, payload: ServiceCreate | ServiceUpdate) -> None:
    service.name = payload.name
    service.description = payload.description
    service.duration_minutes = payload.duration_minutes
    service.booking_type = ServiceBookingType(payload.booking_type)
    service.scheduling_mode = SchedulingMode(payload.scheduling_mode)
    service.price_amount = payload.price_amount
    service.deposit_amount = payload.deposit_amount
    service.appointment_type = AppointmentType(payload.appointment_type)
    service.location = payload.location
    service.use_business_location = payload.use_business_location
    service.host_name = payload.host_name
    service.host_title = payload.host_title
    service.online_meeting_link = payload.online_meeting_link or None
    service.client_instructions = payload.client_instructions
    service.buffer_minutes = payload.buffer_minutes
    service.image_url = payload.image_url or None
    service.active = payload.active


async def _resolve_listing_links(
    session: AsyncSession, tenant_id: str, listing_ids: list[str]
) -> list[Listing]:
    if not listing_ids:
        return []
    rows = (
        await session.execute(
            select(Listing).where(
                Listing.tenant_id == tenant_id,
                Listing.id.in_(listing_ids),
            )
        )
    ).scalars().all()
    by_id = {row.id: row for row in rows}
    missing = [listing_id for listing_id in listing_ids if listing_id not in by_id]
    if missing:
        raise HTTPException(status_code=400, detail="One or more selected listings were not found")
    return [by_id[listing_id] for listing_id in listing_ids]


async def _load_service_with_listings(
    session: AsyncSession, tenant_id: str, service_id: str
) -> Service | None:
    return (
        await session.execute(
            select(Service)
            .options(selectinload(Service.listings))
            .where(Service.tenant_id == tenant_id, Service.id == service_id)
        )
    ).scalar_one_or_none()


@router.get("", response_model=list[ServiceOut])
async def list_services(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ServiceOut]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")

    cache_key = redis_cache.tenant_key(current_user.tenant_id, SERVICES_CACHE)
    cached = await redis_cache.get_json(cache_key)
    if isinstance(cached, list):
        return [ServiceOut.model_validate(item) for item in cached]

    rows = (
        await session.execute(
            select(Service)
            .options(selectinload(Service.listings))
            .where(Service.tenant_id == current_user.tenant_id)
        )
    ).scalars()
    payload = [_to_service_out(row) for row in rows]
    await redis_cache.set_json(cache_key, [item.model_dump(mode="json") for item in payload])
    return payload


@router.post("", response_model=ServiceOut)
async def create_service(
    payload: ServiceCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ServiceOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")
    tenant = (await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    service = Service(tenant_id=current_user.tenant_id)
    _apply_service_payload(service, payload)
    linked_listings = await _resolve_listing_links(session, current_user.tenant_id, payload.listing_ids)
    if service.booking_type == ServiceBookingType.listing and not linked_listings:
        raise HTTPException(status_code=400, detail="Listing-based services must be linked to at least one listing")
    service.listings = linked_listings
    session.add(service)
    await session.commit()
    service_with_links = await _load_service_with_listings(session, current_user.tenant_id, service.id)
    if not service_with_links:
        raise HTTPException(status_code=404, detail="Service not found after create")
    await redis_cache.invalidate_tenant(current_user.tenant_id, SERVICES_CACHE)
    await redis_cache.invalidate_tenant(current_user.tenant_id, "booking-links")
    return _to_service_out(service_with_links)


@router.put("/{service_id}", response_model=ServiceOut)
async def update_service(
    service_id: str,
    payload: ServiceUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ServiceOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")
    service = (
        await session.execute(
            select(Service)
            .options(selectinload(Service.listings))
            .where(Service.id == service_id, Service.tenant_id == current_user.tenant_id)
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    _apply_service_payload(service, payload)
    linked_listings = await _resolve_listing_links(session, current_user.tenant_id, payload.listing_ids)
    if service.booking_type == ServiceBookingType.listing and not linked_listings:
        raise HTTPException(status_code=400, detail="Listing-based services must be linked to at least one listing")
    service.listings = linked_listings
    await session.commit()
    service_with_links = await _load_service_with_listings(session, current_user.tenant_id, service.id)
    if not service_with_links:
        raise HTTPException(status_code=404, detail="Service not found after update")
    if current_user.tenant_id:
        await redis_cache.invalidate_tenant(
            current_user.tenant_id, SERVICES_CACHE, BOOKINGS_CACHE, "booking-links"
        )
    return _to_service_out(service_with_links)


@router.delete("/{service_id}")
async def delete_service(
    service_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    service = (
        await session.execute(
            select(Service)
            .options(selectinload(Service.listings))
            .where(Service.id == service_id, Service.tenant_id == current_user.tenant_id)
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    await session.delete(service)
    await session.commit()
    if current_user.tenant_id:
        await redis_cache.invalidate_tenant(
            current_user.tenant_id, SERVICES_CACHE, BOOKINGS_CACHE, "booking-links"
        )
    return {"ok": True}
