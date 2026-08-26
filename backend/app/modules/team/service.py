"""Team invite seat counting and member updates."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import sha256_text
from app.core.plans import load_plan_definition
from app.infra.models import RefreshToken, StaffRole, TeamInvite, Tenant, User, UserRole
from app.modules.team.staff import is_bookable_user, serialize_staff_member

INVITE_EXPIRE_DAYS = 7
SEAT_UPGRADE_DETAIL = "Upgrade to Premium to add team members"


class TeamServiceError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def _now() -> datetime:
    return datetime.now(UTC)


async def seat_usage(session: AsyncSession, tenant_id: str) -> dict:
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    definition = await load_plan_definition(session, tenant.plan_code)
    active_count = (
        await session.execute(
            select(func.count()).select_from(User).where(
                User.tenant_id == tenant_id,
                User.is_active.is_(True),
                User.role.in_([UserRole.tenant_admin, UserRole.tenant_user]),
            )
        )
    ).scalar_one()
    pending_count = (
        await session.execute(
            select(func.count()).select_from(TeamInvite).where(
                TeamInvite.tenant_id == tenant_id,
                TeamInvite.accepted_at.is_(None),
                TeamInvite.revoked_at.is_(None),
                TeamInvite.expires_at > _now(),
            )
        )
    ).scalar_one()
    used = int(active_count) + int(pending_count)
    limit = definition.team_members
    return {
        "used": used,
        "limit": limit,
        "plan_code": definition.code.value,
        "can_invite": limit is None or used < limit,
    }


async def assert_seat_available(session: AsyncSession, tenant_id: str) -> dict:
    usage = await seat_usage(session, tenant_id)
    limit = usage["limit"]
    if limit is None:
        return usage
    if int(limit) <= 1:
        raise TeamServiceError(SEAT_UPGRADE_DETAIL, status_code=402)
    if usage["used"] >= int(limit):
        raise TeamServiceError(
            f"You've used all {limit} team seats on this plan. Upgrade to add more staff.",
            status_code=402,
        )
    return usage


def _invite_is_pending(invite: TeamInvite) -> bool:
    return invite.accepted_at is None and invite.revoked_at is None and invite.expires_at > _now()


def serialize_invite(invite: TeamInvite) -> dict:
    return {
        "id": invite.id,
        "email": invite.email,
        "full_name": invite.full_name,
        "staff_role": invite.staff_role.value,
        "expires_at": invite.expires_at.isoformat(),
        "created_at": invite.created_at.isoformat() if invite.created_at else None,
        "status": "pending" if _invite_is_pending(invite) else "expired",
    }


async def list_team(session: AsyncSession, tenant_id: str) -> dict:
    members = list(
        (
            await session.execute(
                select(User)
                .where(
                    User.tenant_id == tenant_id,
                    User.role.in_([UserRole.tenant_admin, UserRole.tenant_user]),
                )
                .order_by(User.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    invites = list(
        (
            await session.execute(
                select(TeamInvite)
                .where(
                    TeamInvite.tenant_id == tenant_id,
                    TeamInvite.accepted_at.is_(None),
                    TeamInvite.revoked_at.is_(None),
                    TeamInvite.expires_at > _now(),
                )
                .order_by(TeamInvite.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    usage = await seat_usage(session, tenant_id)
    return {
        "members": [
            {
                **serialize_staff_member(user),
                "job_title": user.job_title,
                "is_bookable": bool(user.is_bookable) if user.role != UserRole.tenant_admin else True,
                "invite_status": "active" if user.is_active else "deactivated",
            }
            for user in members
        ],
        "invites": [serialize_invite(invite) for invite in invites],
        "seats": usage,
    }


async def create_invite(
    session: AsyncSession,
    *,
    tenant: Tenant,
    invited_by_user_id: str,
    email: str,
    full_name: str,
    staff_role: StaffRole,
) -> tuple[TeamInvite, str]:
    await assert_seat_available(session, tenant.id)
    normalized = email.strip().lower()
    existing_user = (
        await session.execute(select(User).where(func.lower(User.email) == normalized))
    ).scalar_one_or_none()
    if existing_user:
        if existing_user.tenant_id == tenant.id:
            raise TeamServiceError("That email already belongs to someone on this team")
        raise TeamServiceError("That email is already used on another Orheo account")

    pending = (
        await session.execute(
            select(TeamInvite).where(
                TeamInvite.tenant_id == tenant.id,
                func.lower(TeamInvite.email) == normalized,
                TeamInvite.accepted_at.is_(None),
                TeamInvite.revoked_at.is_(None),
                TeamInvite.expires_at > _now(),
            )
        )
    ).scalar_one_or_none()
    if pending:
        raise TeamServiceError("An invite is already pending for that email")

    raw_token = secrets.token_urlsafe(32)
    invite = TeamInvite(
        tenant_id=tenant.id,
        email=normalized,
        full_name=full_name.strip()[:120],
        staff_role=staff_role,
        invited_by_user_id=invited_by_user_id,
        token_hash=sha256_text(raw_token),
        expires_at=_now() + timedelta(days=INVITE_EXPIRE_DAYS),
    )
    session.add(invite)
    await session.flush()
    return invite, raw_token


async def resend_invite(session: AsyncSession, *, tenant_id: str, invite_id: str) -> tuple[TeamInvite, str]:
    invite = (
        await session.execute(
            select(TeamInvite).where(TeamInvite.id == invite_id, TeamInvite.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not invite or invite.accepted_at or invite.revoked_at:
        raise TeamServiceError("Invite not found", status_code=404)
    raw_token = secrets.token_urlsafe(32)
    invite.token_hash = sha256_text(raw_token)
    invite.expires_at = _now() + timedelta(days=INVITE_EXPIRE_DAYS)
    await session.flush()
    return invite, raw_token


async def revoke_invite(session: AsyncSession, *, tenant_id: str, invite_id: str) -> None:
    invite = (
        await session.execute(
            select(TeamInvite).where(TeamInvite.id == invite_id, TeamInvite.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not invite or invite.accepted_at:
        raise TeamServiceError("Invite not found", status_code=404)
    invite.revoked_at = _now()
    await session.flush()


async def get_invite_by_token(session: AsyncSession, raw_token: str) -> TeamInvite | None:
    token_hash = sha256_text(raw_token)
    return (
        await session.execute(select(TeamInvite).where(TeamInvite.token_hash == token_hash))
    ).scalar_one_or_none()


async def accept_invite(
    session: AsyncSession,
    *,
    invite: TeamInvite,
    password: str,
) -> User:
    if invite.revoked_at:
        raise TeamServiceError("This invite is no longer valid")
    if invite.accepted_at:
        raise TeamServiceError("This invite has already been used")
    if invite.expires_at <= _now():
        raise TeamServiceError("This invite has expired")

    existing = (
        await session.execute(select(User).where(func.lower(User.email) == invite.email.lower()))
    ).scalar_one_or_none()
    if existing:
        raise TeamServiceError("That email is already used on another Orheo account")

    from app.core.security import hash_password

    bookable = invite.staff_role == StaffRole.staff
    user = User(
        tenant_id=invite.tenant_id,
        full_name=invite.full_name,
        email=invite.email,
        password_hash=hash_password(password),
        role=UserRole.tenant_user,
        staff_role=invite.staff_role,
        is_bookable=bookable,
        is_active=True,
        email_verified=True,
    )
    session.add(user)
    invite.accepted_at = _now()
    await session.flush()
    return user


async def update_member(
    session: AsyncSession,
    *,
    tenant_id: str,
    member_id: str,
    staff_role: StaffRole | None = None,
    job_title: str | None = None,
    is_bookable: bool | None = None,
    is_active: bool | None = None,
) -> User:
    user = (
        await session.execute(
            select(User).where(User.id == member_id, User.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not user:
        raise TeamServiceError("Team member not found", status_code=404)
    if user.role == UserRole.tenant_admin:
        if staff_role is not None:
            raise TeamServiceError("The owner role cannot be changed")
        if is_active is False:
            raise TeamServiceError("The owner cannot be deactivated from Team")
        if job_title is not None:
            user.job_title = job_title.strip()[:80] or None
        if is_bookable is not None:
            user.is_bookable = is_bookable
        await session.flush()
        return user

    if staff_role is not None:
        user.staff_role = staff_role
        if staff_role == StaffRole.staff:
            user.is_bookable = True
    if job_title is not None:
        user.job_title = job_title.strip()[:80] or None
    if is_bookable is not None and user.staff_role != StaffRole.staff:
        user.is_bookable = is_bookable
    if is_active is False and user.is_active:
        user.is_active = False
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
            .values(revoked=True)
        )
    elif is_active is True:
        user.is_active = True
    await session.flush()
    return user
