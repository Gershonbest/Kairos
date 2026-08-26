"""Redis client singleton for caching and distributed locks."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

from redis.asyncio import Redis

from app.core.config import get_settings

DEFAULT_TTL_SECONDS = 300


class RedisCache:
    """Thin wrapper around a shared async Redis connection."""

    def __init__(self, *, url: str | None = None, decode_responses: bool = True):
        settings = get_settings()
        self.client: Redis = Redis.from_url(url or settings.redis_url, decode_responses=decode_responses)
        self.default_ttl: int = settings.cache_ttl_seconds or DEFAULT_TTL_SECONDS

    async def get_client(self) -> AsyncGenerator[Redis, None]:
        yield self.client

    async def ping(self) -> bool:
        return bool(await self.client.ping())

    @staticmethod
    def tenant_key(tenant_id: str, resource: str) -> str:
        return f"tenant:{tenant_id}:{resource}"

    @staticmethod
    def admin_key(resource: str) -> str:
        return f"admin:{resource}"

    async def get_json(self, key: str) -> Any | None:
        raw = await self.client.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            await self.client.delete(key)
            return None

    async def set_json(self, key: str, value: Any, *, ttl_seconds: int | None = None) -> None:
        await self.client.set(key, json.dumps(value, default=str), ex=ttl_seconds or self.default_ttl)

    async def delete(self, *keys: str) -> None:
        if keys:
            await self.client.delete(*keys)

    async def delete_by_pattern(self, pattern: str) -> None:
        """Delete all keys matching a Redis glob pattern (e.g. admin:payments:*)."""
        cursor = 0
        while True:
            cursor, keys = await self.client.scan(cursor=cursor, match=pattern, count=200)
            if keys:
                await self.delete(*[str(key) for key in keys])
            if cursor == 0:
                break

    async def invalidate_tenant(self, tenant_id: str, *resources: str) -> None:
        if not resources:
            return
        keys = [self.tenant_key(tenant_id, resource) for resource in resources]
        await self.delete(*keys)

    async def invalidate_admin(self, *resources: str) -> None:
        if not resources:
            return
        await self.delete(*[self.admin_key(resource) for resource in resources])

    async def invalidate_admin_overview(self) -> None:
        """Drop platform metrics + subscriber directory caches."""
        await self.invalidate_admin("metrics", "subscribers", "plans", "plan_catalog")

    async def invalidate_admin_payments(self) -> None:
        """Drop all filtered payment hub caches (summary, rollups, logs)."""
        await self.delete_by_pattern("admin:payments:*")
        await self.invalidate_admin("metrics")


redis_cache = RedisCache()
redis_client = redis_cache.client


async def get_redis() -> AsyncGenerator[Redis, None]:
    async for client in redis_cache.get_client():
        yield client
