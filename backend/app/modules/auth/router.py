"""Signup, login, email verification, and Google auth endpoints."""

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import sha256_text
from app.core.config import get_settings
from app.core.deps import CurrentUser, get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.infra.db import get_db_session
from app.infra.models import EmailVerificationToken, RefreshToken, Tenant, User, UserRole
from app.modules.auth.google import verify_google_id_token
from app.modules.notifications.service import send_tenant_verification_email
from app.modules.subscriptions.service import start_tenant_trial, subscription_status_payload
from app.schemas.auth import (
    AdminLoginRequest,
    GoogleAuthRequest,
    GoogleAuthResponse,
    LoginRequest,
    RefreshRequest,
    ResendVerificationRequest,
    SignUpRequest,
    SignUpResponse,
    TokenPair,
    UpdateProfileRequest,
    VerifyEmailRequest,
    VerifyEmailResponse,
)

router = APIRouter()
settings = get_settings()


async def _issue_tokens(session: AsyncSession, user: User) -> TokenPair:
    access_token = create_access_token(user_id=user.id, role=user.role.value, tenant_id=user.tenant_id)
    refresh_token = create_refresh_token(user_id=user.id)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=sha256_text(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
    )
    await session.commit()
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


async def _create_verification_token(session: AsyncSession, user_id: str) -> str:
    raw_token = secrets.token_urlsafe(32)
    session.add(
        EmailVerificationToken(
            user_id=user_id,
            token_hash=sha256_text(raw_token),
            expires_at=datetime.now(UTC)
            + timedelta(hours=settings.email_verification_token_expire_hours),
        )
    )
    return raw_token


def _queue_verification_email(background_tasks: BackgroundTasks, *, email: str, full_name: str, raw_token: str) -> None:
    frontend_base_url = get_settings().frontend_base_url.rstrip("/")
    verify_url = f"{frontend_base_url}/auth/verify-email?token={raw_token}"
    background_tasks.add_task(
        send_tenant_verification_email,
        to=email,
        full_name=full_name,
        verify_url=verify_url,
    )


def _default_business_name(full_name: str, email: str) -> str:
    cleaned = full_name.strip()
    if cleaned:
        return f"{cleaned}'s Business"
    return email.split("@")[0].replace(".", " ").title()


def _build_public_slug(business_name: str, email: str) -> str:
    base_slug = business_name.strip().lower().replace(" ", "-")
    return f"{base_slug}-{email.split('@')[0][:6]}".replace("--", "-")


@router.post("/google", response_model=GoogleAuthResponse)
async def google_auth(
    payload: GoogleAuthRequest,
    session: AsyncSession = Depends(get_db_session),
) -> GoogleAuthResponse:
    profile = await verify_google_id_token(payload.id_token)

    user = (
        await session.execute(
            select(User).where(or_(User.google_id == profile["google_id"], User.email == profile["email"]))
        )
    ).scalar_one_or_none()

    if user:
        if user.role == UserRole.platform_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Use admin login for this account",
            )
        if not user.google_id:
            user.google_id = profile["google_id"]
        user.email_verified = True
        if not user.full_name.strip():
            user.full_name = profile["full_name"]
        tokens = await _issue_tokens(session, user)
        return GoogleAuthResponse(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            is_new_user=False,
        )

    business_name = (payload.business_name or "").strip() or _default_business_name(
        profile["full_name"], profile["email"]
    )
    tenant = Tenant(name=business_name, public_slug=_build_public_slug(business_name, profile["email"]))
    start_tenant_trial(tenant)
    session.add(tenant)
    await session.flush()

    user = User(
        tenant_id=tenant.id,
        full_name=profile["full_name"],
        email=profile["email"],
        password_hash=None,
        google_id=profile["google_id"],
        role=UserRole.tenant_admin,
        email_verified=True,
    )
    session.add(user)
    await session.flush()

    tokens = await _issue_tokens(session, user)
    return GoogleAuthResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        is_new_user=True,
    )


@router.post("/signup", response_model=SignUpResponse)
async def signup(
    payload: SignUpRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
) -> SignUpResponse:
    exists = (await session.execute(select(User).where(User.email == payload.email.lower()))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    base_slug = payload.business_name.strip().lower().replace(" ", "-")
    public_slug = f"{base_slug}-{payload.email.split('@')[0][:6]}".replace("--", "-")
    tenant = Tenant(name=payload.business_name, public_slug=public_slug)
    start_tenant_trial(tenant)
    session.add(tenant)
    await session.flush()
    full_name = f"{payload.first_name.strip()} {payload.last_name.strip()}".strip()
    requires_verification = settings.email_verification_required
    user = User(
        tenant_id=tenant.id,
        full_name=full_name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=UserRole.tenant_admin,
        email_verified=not requires_verification,
    )
    session.add(user)
    await session.flush()

    if requires_verification:
        raw_token = await _create_verification_token(session, user.id)
        await session.commit()
        _queue_verification_email(background_tasks, email=user.email, full_name=user.full_name, raw_token=raw_token)
        return SignUpResponse(needs_email_verification=True, email=user.email)

    tokens = await _issue_tokens(session, user)
    return SignUpResponse(
        needs_email_verification=False,
        email=user.email,
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
    )


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(payload: VerifyEmailRequest, session: AsyncSession = Depends(get_db_session)) -> VerifyEmailResponse:
    token_hash = sha256_text(payload.token)
    record = (
        await session.execute(
            select(EmailVerificationToken).where(
                EmailVerificationToken.token_hash == token_hash,
                EmailVerificationToken.used_at.is_(None),
                EmailVerificationToken.expires_at > datetime.now(UTC),
            )
        )
    ).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification link")

    user = (await session.execute(select(User).where(User.id == record.user_id))).scalar_one()
    user.email_verified = True
    record.used_at = datetime.now(UTC)

    onboarding_completed = False
    if user.tenant_id:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        ).scalar_one_or_none()
        onboarding_completed = bool(tenant and tenant.onboarding_completed)

    tokens = await _issue_tokens(session, user)
    return VerifyEmailResponse(
        ok=True,
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        onboarding_completed=onboarding_completed,
    )


@router.post("/resend-verification")
async def resend_verification(
    payload: ResendVerificationRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    user = (
        await session.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()
    if user and not user.email_verified:
        raw_token = await _create_verification_token(session, user.id)
        await session.commit()
        _queue_verification_email(background_tasks, email=user.email, full_name=user.full_name, raw_token=raw_token)
    return {"ok": True}


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_db_session)) -> TokenPair:
    user = (await session.execute(select(User).where(User.email == payload.email.lower()))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account uses Google sign-in",
        )
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if (
        settings.email_verification_required
        and user.role != UserRole.platform_admin
        and not user.email_verified
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")
    return await _issue_tokens(session, user)


@router.post("/admin/login", response_model=TokenPair)
async def admin_login(payload: AdminLoginRequest, session: AsyncSession = Depends(get_db_session)) -> TokenPair:
    if (
        payload.email.lower() != settings.super_admin_email.lower()
        or payload.password != settings.super_admin_password
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin credentials")

    user = (
        await session.execute(select(User).where(User.email == settings.super_admin_email.lower()))
    ).scalar_one_or_none()
    if not user:
        user = User(
            tenant_id=None,
            full_name=settings.super_admin_name,
            email=settings.super_admin_email.lower(),
            password_hash=hash_password(settings.super_admin_password),
            role=UserRole.platform_admin,
            is_active=True,
            email_verified=True,
        )
        session.add(user)
        await session.flush()

    return await _issue_tokens(session, user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, session: AsyncSession = Depends(get_db_session)) -> TokenPair:
    token_hash = sha256_text(payload.refresh_token)
    record = (
        await session.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked.is_(False),
                RefreshToken.expires_at > datetime.now(UTC),
            )
        )
    ).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user = (await session.execute(select(User).where(User.id == record.user_id))).scalar_one()
    await session.execute(update(RefreshToken).where(RefreshToken.id == record.id).values(revoked=True))
    access_token = create_access_token(user_id=user.id, role=user.role.value, tenant_id=user.tenant_id)
    refresh_token = create_refresh_token(user_id=user.id)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=sha256_text(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
    )
    await session.commit()
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout")
async def logout(
    payload: RefreshRequest,
    _: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    await session.execute(
        update(RefreshToken).where(RefreshToken.token_hash == sha256_text(payload.refresh_token)).values(revoked=True)
    )
    await session.commit()
    return {"ok": True}


@router.get("/me")
async def me(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    user = (await session.execute(select(User).where(User.id == current_user.id))).scalar_one()
    onboarding_completed = False
    subscription: dict | None = None
    if user.tenant_id:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        ).scalar_one_or_none()
        if tenant:
            onboarding_completed = tenant.onboarding_completed
            subscription = subscription_status_payload(tenant)
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "tenant_id": user.tenant_id,
        "role": user.role.value,
        "email_verified": user.email_verified,
        "onboarding_completed": onboarding_completed,
        "subscription": subscription,
    }


@router.patch("/me")
async def update_me(
    payload: UpdateProfileRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    user = (await session.execute(select(User).where(User.id == current_user.id))).scalar_one()

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()

    if payload.new_password:
        if not user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This account uses Google sign-in and cannot set a password here",
            )
        if not payload.current_password or not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        user.password_hash = hash_password(payload.new_password)

    await session.commit()
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "email_verified": user.email_verified,
    }
