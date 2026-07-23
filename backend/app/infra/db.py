"""Async SQLAlchemy engine and database session dependency."""

import ssl
from collections.abc import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


def asyncpg_engine_kwargs(database_url: str) -> tuple[str, dict]:
    """Strip libpq-only URL params and map SSL settings for asyncpg."""
    if "+asyncpg" not in database_url:
        return database_url, {}

    parsed = urlparse(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    connect_args: dict = {
        "timeout": 60,
        "command_timeout": 60,
    }

    sslmode = query.pop("sslmode", None)
    query.pop("channel_binding", None)

    if sslmode in {"require", "verify-ca", "verify-full", "prefer"}:
        connect_args["ssl"] = ssl.create_default_context()
    elif parsed.hostname and parsed.hostname.endswith(".neon.tech"):
        connect_args["ssl"] = ssl.create_default_context()

    cleaned_url = urlunparse(parsed._replace(query=urlencode(query)))
    return cleaned_url, connect_args


class Database:
    """Owns the async engine and session factory for the app."""

    def __init__(self, *, database_url: str | None = None):
        settings = get_settings()
        url, connect_args = asyncpg_engine_kwargs(database_url or settings.database_url)
        self.engine: AsyncEngine = create_async_engine(
            url,
            connect_args=connect_args,
            pool_pre_ping=True,
            pool_recycle=300,
            pool_size=5,
            max_overflow=10,
            pool_timeout=60,
            future=True,
        )
        self.SessionLocal = async_sessionmaker(
            bind=self.engine,
            autoflush=False,
            expire_on_commit=False,
            class_=AsyncSession,
        )

    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        async with self.SessionLocal() as session:
            yield session


database = Database()
engine = database.engine
SessionLocal = database.SessionLocal


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async for session in database.get_session():
        yield session
