"""Admin Redis cache key helpers."""

from app.infra.cache import RedisCache


def test_admin_key_prefix() -> None:
    assert RedisCache.admin_key("metrics") == "admin:metrics"
    assert RedisCache.admin_key("payments:summary:abc") == "admin:payments:summary:abc"
