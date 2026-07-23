"""Redis client singleton for caching and distributed locks."""

from collections.abc import AsyncGenerator

from redis.asyncio import Redis

from app.core.config import get_settings


class RedisCache:
    """Thin wrapper around a shared async Redis connection."""

    def __init__(self, *, url: str | None = None, decode_responses: bool = True):
        settings = get_settings()
        self.client: Redis = Redis.from_url(url or settings.redis_url, decode_responses=decode_responses)

    async def get_client(self) -> AsyncGenerator[Redis, None]:
        yield self.client

    async def ping(self) -> bool:
        return bool(await self.client.ping())


redis_cache = RedisCache()
redis_client = redis_cache.client


async def get_redis() -> AsyncGenerator[Redis, None]:
    async for client in redis_cache.get_client():
        yield client
