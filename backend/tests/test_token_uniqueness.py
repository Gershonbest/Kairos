"""JWT issuance uniqueness for refresh-token rotation."""

from app.core.security import create_refresh_token, create_token
from datetime import timedelta


def test_create_token_includes_unique_jti() -> None:
    a = create_token("user-1", timedelta(days=7), extra={"type": "refresh"})
    b = create_token("user-1", timedelta(days=7), extra={"type": "refresh"})
    assert a != b


def test_create_refresh_token_is_unique_for_same_user() -> None:
    tokens = {create_refresh_token("user-1") for _ in range(20)}
    assert len(tokens) == 20
