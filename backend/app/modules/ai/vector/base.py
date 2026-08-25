"""Swappable vector-store adapters for tenant knowledge RAG."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class KnowledgeDocument:
    id: str
    source: str
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ScoredDocument:
    id: str
    source: str
    content: str
    score: float
    metadata: dict[str, Any] = field(default_factory=dict)


class VectorStore(Protocol):
    """Vector DB adapter. Every search/upsert is tenant-scoped."""

    async def upsert(self, *, tenant_id: str, docs: list[KnowledgeDocument]) -> None: ...

    async def delete_tenant(self, tenant_id: str) -> None: ...

    async def similarity_search(
        self,
        *,
        tenant_id: str,
        query: str,
        k: int = 6,
    ) -> list[ScoredDocument]: ...
