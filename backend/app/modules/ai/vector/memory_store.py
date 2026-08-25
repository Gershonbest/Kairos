"""In-memory vector store (tests and local sqlite)."""

from __future__ import annotations

from collections import defaultdict

from app.modules.ai.vector.base import KnowledgeDocument, ScoredDocument, VectorStore
from app.modules.ai.vector.embeddings import cosine_similarity, embed_query, embed_texts


class InMemoryVectorStore:
    def __init__(self) -> None:
        self._docs: dict[str, dict[str, tuple[KnowledgeDocument, list[float]]]] = defaultdict(dict)

    async def upsert(self, *, tenant_id: str, docs: list[KnowledgeDocument]) -> None:
        if not docs:
            return
        vectors = await embed_texts([doc.content for doc in docs])
        bucket = self._docs[tenant_id]
        for doc, vector in zip(docs, vectors, strict=True):
            bucket[doc.id] = (doc, vector)

    async def delete_tenant(self, tenant_id: str) -> None:
        self._docs.pop(tenant_id, None)

    async def similarity_search(
        self,
        *,
        tenant_id: str,
        query: str,
        k: int = 6,
    ) -> list[ScoredDocument]:
        bucket = self._docs.get(tenant_id) or {}
        if not bucket:
            return []
        query_vec = await embed_query(query)
        scored: list[ScoredDocument] = []
        for doc, vector in bucket.values():
            score = cosine_similarity(query_vec, vector)
            scored.append(
                ScoredDocument(
                    id=doc.id,
                    source=doc.source,
                    content=doc.content,
                    score=score,
                    metadata=dict(doc.metadata),
                )
            )
        scored.sort(key=lambda item: item.score, reverse=True)
        return scored[: max(1, k)]


# Protocol conformance helper for type checkers.
def _as_vector_store(store: InMemoryVectorStore) -> VectorStore:
    return store
