"""Vector store factory."""

from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.infra.db import SessionLocal
from app.modules.ai.vector.base import VectorStore
from app.modules.ai.vector.memory_store import InMemoryVectorStore
from app.modules.ai.vector.pgvector_store import PgVectorStore

_MEMORY = InMemoryVectorStore()


@lru_cache
def get_vector_store() -> VectorStore:
    settings = get_settings()
    provider = (settings.vector_store_provider or "pgvector").strip().lower()
    if provider == "memory":
        return _MEMORY
    # Default: Postgres-backed store (works with JSON fallback on sqlite too if pointed
    # at a session factory that uses the same schema; for unit tests use memory).
    db_url = (settings.database_url or "").lower()
    if db_url.startswith("sqlite"):
        return _MEMORY
    return PgVectorStore(SessionLocal)
