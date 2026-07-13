"""Password hashing and JWT access/refresh token creation."""

from datetime import UTC, datetime, timedelta
from typing import Any

from jose import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_token(subject: str, expires_delta: timedelta, extra: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {"sub": subject, "iat": now, "exp": now + expires_delta}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_access_token(user_id: str, role: str, tenant_id: str | None) -> str:
    settings = get_settings()
    return create_token(
        subject=user_id,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        extra={"role": role, "tenant_id": tenant_id, "type": "access"},
    )


def create_refresh_token(user_id: str) -> str:
    settings = get_settings()
    return create_token(
        subject=user_id,
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
        extra={"type": "refresh"},
    )
