"""Rebuild a tenant's RAG index from live profile/services/FAQs."""

from __future__ import annotations

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.knowledge.documents import build_tenant_documents
from app.modules.ai.vector.factory import get_vector_store

logger = structlog.get_logger()


async def reindex_tenant_knowledge(session: AsyncSession, tenant_id: str) -> int:
    docs = await build_tenant_documents(session, tenant_id)
    store = get_vector_store()
    await store.delete_tenant(tenant_id)
    await store.upsert(tenant_id=tenant_id, docs=docs)
    logger.info("ai.knowledge_reindexed", tenant_id=tenant_id, chunks=len(docs))
    return len(docs)
