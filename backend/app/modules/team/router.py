"""Team member listing, invites, and seat management."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription, require_permission
from app.core.permissions import TEAM_MANAGE
from app.infra.db import get_db_session
from app.infra.models import StaffRole, Tenant
from app.modules.notifications.service import send_team_invite_email
from app.modules.team.service import (
    TeamServiceError,
    create_invite,
    list_team,
    resend_invite,
    revoke_invite,
    serialize_invite,
    update_member,
)
from app.modules.team.staff import serialize_staff_member
from app.schemas.team import TeamInviteCreateRequest, TeamMemberUpdateRequest

router = APIRouter(dependencies=[Depends(require_active_subscription)])


def _raise(exc: TeamServiceError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


def _queue_invite_email(
    background_tasks: BackgroundTasks,
    *,
    tenant: Tenant,
    invite_email: str,
    full_name: str,
    raw_token: str,
) -> None:
    background_tasks.add_task(
        send_team_invite_email,
        to=invite_email,
        full_name=full_name,
        business_name=tenant.name,
        raw_token=raw_token,
    )


@router.get("")
async def get_team(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    return await list_team(session, current_user.tenant_id)


@router.post("/invites", status_code=status.HTTP_201_CREATED)
async def invite_member(
    payload: TeamInviteCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(require_permission(TEAM_MANAGE)),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one()
    try:
        invite, raw_token = await create_invite(
            session,
            tenant=tenant,
            invited_by_user_id=current_user.id,
            email=str(payload.email),
            full_name=payload.full_name,
            staff_role=StaffRole(payload.staff_role),
        )
    except TeamServiceError as exc:
        _raise(exc)
    await session.commit()
    _queue_invite_email(
        background_tasks,
        tenant=tenant,
        invite_email=invite.email,
        full_name=invite.full_name,
        raw_token=raw_token,
    )
    return serialize_invite(invite)


@router.post("/invites/{invite_id}/resend")
async def resend_member_invite(
    invite_id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(require_permission(TEAM_MANAGE)),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one()
    try:
        invite, raw_token = await resend_invite(
            session, tenant_id=current_user.tenant_id, invite_id=invite_id
        )
    except TeamServiceError as exc:
        _raise(exc)
    await session.commit()
    _queue_invite_email(
        background_tasks,
        tenant=tenant,
        invite_email=invite.email,
        full_name=invite.full_name,
        raw_token=raw_token,
    )
    return serialize_invite(invite)


@router.delete("/invites/{invite_id}")
async def delete_member_invite(
    invite_id: str,
    current_user: CurrentUser = Depends(require_permission(TEAM_MANAGE)),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    try:
        await revoke_invite(session, tenant_id=current_user.tenant_id, invite_id=invite_id)
    except TeamServiceError as exc:
        _raise(exc)
    await session.commit()
    return {"ok": True}


@router.patch("/members/{member_id}")
async def patch_member(
    member_id: str,
    payload: TeamMemberUpdateRequest,
    current_user: CurrentUser = Depends(require_permission(TEAM_MANAGE)),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    try:
        user = await update_member(
            session,
            tenant_id=current_user.tenant_id,
            member_id=member_id,
            staff_role=StaffRole(payload.staff_role) if payload.staff_role else None,
            job_title=payload.job_title,
            is_bookable=payload.is_bookable,
            is_active=payload.is_active,
        )
    except TeamServiceError as exc:
        _raise(exc)
    await session.commit()
    return serialize_staff_member(user)
