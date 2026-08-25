"""Postgres-backed vector store (pgvector when available, JSON fallback)."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.ai.vector.base import KnowledgeDocument, ScoredDocument
from app.modules.ai.vector.embeddings import cosine_similarity, embed_query, embed_texts


class PgVectorStore:
    """Tenant-scoped knowledge store on Postgres.

    Prefers the ``vector`` extension + cosine distance. Falls back to JSON
    embeddings + Python cosine when the extension is unavailable (e.g. local sqlite).
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory
        self._pgvector_ready: bool | None = None

    async def _detect_pgvector(self, session: AsyncSession) -> bool:
        if self._pgvector_ready is not None:
            return self._pgvector_ready
        bind = session.get_bind()
        dialect = getattr(bind, "dialect", None)
        name = getattr(dialect, "name", "") if dialect else ""
        if name != "postgresql":
            self._pgvector_ready = False
            return False
        try:
            result = await session.execute(
                text("SELECT 1 FROM pg_extension WHERE extname = 'vector' LIMIT 1")
            )
            self._pgvector_ready = result.scalar_one_or_none() is not None
        except Exception:
            self._pgvector_ready = False
        return self._pgvector_ready

    async def upsert(self, *, tenant_id: str, docs: list[KnowledgeDocument]) -> None:
        if not docs:
            return
        vectors = await embed_texts([doc.content for doc in docs])
        now = datetime.now(UTC)
        async with self._session_factory() as session:
            use_vector = await self._detect_pgvector(session)
            for doc, vector in zip(docs, vectors, strict=True):
                chunk_id = doc.id or str(uuid.uuid4())
                await session.execute(
                    text(
                        """
                        DELETE FROM ai_knowledge_chunks
                        WHERE tenant_id = :tenant_id AND id = :id
                        """
                    ),
                    {"tenant_id": tenant_id, "id": chunk_id},
                )
                if use_vector:
                    await session.execute(
                        text(
                            """
                            INSERT INTO ai_knowledge_chunks
                              (id, tenant_id, source, content, embedding, embedding_json, metadata, updated_at)
                            VALUES
                              (:id, :tenant_id, :source, :content, CAST(:embedding AS vector),
                               CAST(:embedding_json AS jsonb), CAST(:metadata AS jsonb), :updated_at)
                            """
                        ),
                        {
                            "id": chunk_id,
                            "tenant_id": tenant_id,
                            "source": doc.source,
                            "content": doc.content,
                            "embedding": "[" + ",".join(str(float(v)) for v in vector) + "]",
                            "embedding_json": json.dumps(vector),
                            "metadata": json.dumps(doc.metadata or {}),
                            "updated_at": now,
                        },
                    )
                else:
                    await session.execute(
                        text(
                            """
                            INSERT INTO ai_knowledge_chunks
                              (id, tenant_id, source, content, embedding_json, metadata, updated_at)
                            VALUES
                              (:id, :tenant_id, :source, :content, :embedding_json, :metadata, :updated_at)
                            """
                        ),
                        {
                            "id": chunk_id,
                            "tenant_id": tenant_id,
                            "source": doc.source,
                            "content": doc.content,
                            "embedding_json": json.dumps(vector),
                            "metadata": json.dumps(doc.metadata or {}),
                            "updated_at": now,
                        },
                    )
            await session.commit()

    async def delete_tenant(self, tenant_id: str) -> None:
        async with self._session_factory() as session:
            await session.execute(
                text("DELETE FROM ai_knowledge_chunks WHERE tenant_id = :tenant_id"),
                {"tenant_id": tenant_id},
            )
            await session.commit()

    async def similarity_search(
        self,
        *,
        tenant_id: str,
        query: str,
        k: int = 6,
    ) -> list[ScoredDocument]:
        query_vec = await embed_query(query)
        limit = max(1, k)
        async with self._session_factory() as session:
            use_vector = await self._detect_pgvector(session)
            if use_vector:
                embedding_literal = "[" + ",".join(str(float(v)) for v in query_vec) + "]"
                rows = (
                    await session.execute(
                        text(
                            """
                            SELECT id, source, content, metadata,
                                   1 - (embedding <=> CAST(:embedding AS vector)) AS score
                            FROM ai_knowledge_chunks
                            WHERE tenant_id = :tenant_id AND embedding IS NOT NULL
                            ORDER BY embedding <=> CAST(:embedding AS vector)
                            LIMIT :limit
                            """
                        ),
                        {
                            "tenant_id": tenant_id,
                            "embedding": embedding_literal,
                            "limit": limit,
                        },
                    )
                ).mappings().all()
                return [
                    ScoredDocument(
                        id=str(row["id"]),
                        source=str(row["source"]),
                        content=str(row["content"]),
                        score=float(row["score"] or 0.0),
                        metadata=_as_dict(row["metadata"]),
                    )
                    for row in rows
                ]

            rows = (
                await session.execute(
                    text(
                        """
                        SELECT id, source, content, metadata, embedding_json
                        FROM ai_knowledge_chunks
                        WHERE tenant_id = :tenant_id
                        """
                    ),
                    {"tenant_id": tenant_id},
                )
            ).mappings().all()

        scored: list[ScoredDocument] = []
        for row in rows:
            vector = _as_float_list(row["embedding_json"])
            score = cosine_similarity(query_vec, vector)
            scored.append(
                ScoredDocument(
                    id=str(row["id"]),
                    source=str(row["source"]),
                    content=str(row["content"]),
                    score=score,
                    metadata=_as_dict(row["metadata"]),
                )
            )
        scored.sort(key=lambda item: item.score, reverse=True)
        return scored[:limit]


def _as_dict(value: object) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _as_float_list(value: object) -> list[float]:
    if isinstance(value, list):
        return [float(v) for v in value]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [float(v) for v in parsed]
        except json.JSONDecodeError:
            return []
    return []
