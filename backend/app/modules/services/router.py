"""Tenant service catalog CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import AppointmentType, Service, Tenant
from app.schemas.services import ServiceCreate, ServiceOut, ServiceUpdate

router = APIRouter(dependencies=[Depends(require_active_subscription)])


def _to_service_out(service: Service) -> ServiceOut:
    return ServiceOut(
        id=service.id,
        name=service.name,
        description=service.description,
        duration_minutes=service.duration_minutes,
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
    )


def _apply_service_payload(service: Service, payload: ServiceCreate | ServiceUpdate) -> None:
    service.name = payload.name
    service.description = payload.description
    service.duration_minutes = payload.duration_minutes
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


@router.get("", response_model=list[ServiceOut])
async def list_services(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ServiceOut]:
    rows = (
        await session.execute(select(Service).where(Service.tenant_id == current_user.tenant_id))
    ).scalars()
    return [_to_service_out(row) for row in rows]


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
    session.add(service)
    await session.commit()
    await session.refresh(service)
    return _to_service_out(service)


@router.put("/{service_id}", response_model=ServiceOut)
async def update_service(
    service_id: str,
    payload: ServiceUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ServiceOut:
    service = (
        await session.execute(
            select(Service).where(Service.id == service_id, Service.tenant_id == current_user.tenant_id)
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    _apply_service_payload(service, payload)
    await session.commit()
    await session.refresh(service)
    return _to_service_out(service)


@router.delete("/{service_id}")
async def delete_service(
    service_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    service = (
        await session.execute(
            select(Service).where(Service.id == service_id, Service.tenant_id == current_user.tenant_id)
        )
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    await session.delete(service)
    await session.commit()
    return {"ok": True}
