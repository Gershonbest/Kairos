"""Tenant listings catalog CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.cache import redis_cache
from app.infra.db import get_db_session
from app.infra.models import Listing, ListingStatus, Service, ServiceBookingType
from app.schemas.listings import ListingCreate, ListingOut, ListingUpdate

router = APIRouter(dependencies=[Depends(require_active_subscription)])

LISTINGS_CACHE = "listings:list"
SERVICES_CACHE = "services:list"


def _to_listing_out(listing: Listing) -> ListingOut:
    return ListingOut(
        id=listing.id,
        name=listing.name,
        description=listing.description,
        status=listing.status.value,
        image_urls=listing.image_urls or [],
        active=listing.active,
        service_ids=[service.id for service in listing.services],
        created_at=listing.created_at,
        updated_at=listing.updated_at,
    )


async def _resolve_services(
    session: AsyncSession, tenant_id: str, service_ids: list[str]
) -> list[Service]:
    if not service_ids:
        return []
    rows = (
        await session.execute(
            select(Service).where(Service.tenant_id == tenant_id, Service.id.in_(service_ids))
        )
    ).scalars().all()
    by_id = {row.id: row for row in rows}
    missing = [service_id for service_id in service_ids if service_id not in by_id]
    if missing:
        raise HTTPException(status_code=400, detail="One or more selected services were not found")
    incompatible = [row.name for row in rows if row.booking_type != ServiceBookingType.listing]
    if incompatible:
        joined = ", ".join(incompatible)
        raise HTTPException(
            status_code=400,
            detail=f"Products can only link to Product-Based services. Update these services first: {joined}",
        )
    return [by_id[service_id] for service_id in service_ids]


async def _load_listing(session: AsyncSession, listing_id: str, tenant_id: str) -> Listing | None:
    return (
        await session.execute(
            select(Listing)
            .options(selectinload(Listing.services))
            .where(Listing.id == listing_id, Listing.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()


@router.get("", response_model=list[ListingOut])
async def list_listings(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ListingOut]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")

    cache_key = redis_cache.tenant_key(current_user.tenant_id, LISTINGS_CACHE)
    cached = await redis_cache.get_json(cache_key)
    if isinstance(cached, list):
        return [ListingOut.model_validate(item) for item in cached]

    rows = (
        await session.execute(
            select(Listing)
            .options(selectinload(Listing.services))
            .where(Listing.tenant_id == current_user.tenant_id)
            .order_by(Listing.created_at.desc())
        )
    ).scalars()
    payload = [_to_listing_out(row) for row in rows]
    await redis_cache.set_json(cache_key, [item.model_dump(mode="json") for item in payload])
    return payload


@router.post("", response_model=ListingOut)
async def create_listing(
    payload: ListingCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ListingOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")

    listing = Listing(tenant_id=current_user.tenant_id)
    listing.name = payload.name
    listing.description = payload.description
    listing.status = ListingStatus(payload.status)
    listing.image_urls = payload.image_urls
    listing.active = payload.active
    listing.services = await _resolve_services(session, current_user.tenant_id, payload.service_ids)
    session.add(listing)
    await session.commit()
    listing_row = await _load_listing(session, listing.id, current_user.tenant_id)
    if not listing_row:
        raise HTTPException(status_code=404, detail="Listing not found after create")
    await redis_cache.invalidate_tenant(
        current_user.tenant_id, LISTINGS_CACHE, SERVICES_CACHE, "booking-links"
    )
    return _to_listing_out(listing_row)


@router.put("/{listing_id}", response_model=ListingOut)
async def update_listing(
    listing_id: str,
    payload: ListingUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ListingOut:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")
    listing = (
        await session.execute(
            select(Listing)
            .options(selectinload(Listing.services))
            .where(Listing.id == listing_id, Listing.tenant_id == current_user.tenant_id)
        )
    ).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    listing.name = payload.name
    listing.description = payload.description
    listing.status = ListingStatus(payload.status)
    listing.image_urls = payload.image_urls
    listing.active = payload.active
    listing.services = await _resolve_services(session, current_user.tenant_id, payload.service_ids)
    await session.commit()
    listing_row = await _load_listing(session, listing.id, current_user.tenant_id)
    if not listing_row:
        raise HTTPException(status_code=404, detail="Listing not found after update")
    await redis_cache.invalidate_tenant(
        current_user.tenant_id, LISTINGS_CACHE, SERVICES_CACHE, "booking-links"
    )
    return _to_listing_out(listing_row)


@router.delete("/{listing_id}")
async def delete_listing(
    listing_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context")
    listing = (
        await session.execute(
            select(Listing).where(Listing.id == listing_id, Listing.tenant_id == current_user.tenant_id)
        )
    ).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    await session.delete(listing)
    await session.commit()
    if current_user.tenant_id:
        await redis_cache.invalidate_tenant(
            current_user.tenant_id, LISTINGS_CACHE, SERVICES_CACHE, "booking-links"
        )
    return {"ok": True}
