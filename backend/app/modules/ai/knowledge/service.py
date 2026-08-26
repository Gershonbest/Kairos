"""Tenant knowledge document upload and indexing helpers."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.models import KnowledgeDocumentStatus, TenantFaq, TenantKnowledgeDocument
from app.modules.ai.knowledge.extract import ExtractError, extract_text_from_bytes
from app.modules.ai.knowledge.indexer import reindex_tenant_knowledge

MAX_DOCS_PER_TENANT = 20


def serialize_document(doc: TenantKnowledgeDocument) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "filename": doc.filename,
        "content_type": doc.content_type,
        "storage_url": doc.storage_url,
        "status": doc.status.value if hasattr(doc.status, "value") else str(doc.status),
        "error_message": doc.error_message,
        "byte_size": doc.byte_size,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }


def serialize_faq(faq: TenantFaq) -> dict:
    return {
        "id": faq.id,
        "question": faq.question,
        "answer": faq.answer,
        "sort_order": faq.sort_order,
        "created_at": faq.created_at.isoformat() if faq.created_at else None,
    }


async def count_documents(session: AsyncSession, tenant_id: str) -> int:
    return int(
        (
            await session.execute(
                select(func.count())
                .select_from(TenantKnowledgeDocument)
                .where(TenantKnowledgeDocument.tenant_id == tenant_id)
            )
        ).scalar_one()
        or 0
    )


async def list_documents(session: AsyncSession, tenant_id: str) -> list[TenantKnowledgeDocument]:
    rows = (
        await session.execute(
            select(TenantKnowledgeDocument)
            .where(TenantKnowledgeDocument.tenant_id == tenant_id)
            .order_by(TenantKnowledgeDocument.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def create_document_from_upload(
    session: AsyncSession,
    *,
    tenant_id: str,
    title: str,
    filename: str,
    content_type: str,
    storage_url: str,
    data: bytes,
    byte_size: int,
) -> TenantKnowledgeDocument:
    doc = TenantKnowledgeDocument(
        tenant_id=tenant_id,
        title=(title or Path(filename).stem or "Document")[:200],
        filename=(filename or "document")[:255],
        content_type=content_type,
        storage_url=storage_url,
        status=KnowledgeDocumentStatus.pending,
        byte_size=byte_size,
    )
    session.add(doc)
    await session.flush()

    try:
        text = extract_text_from_bytes(data=data, content_type=content_type, filename=filename)
        doc.extracted_text = text
        doc.status = KnowledgeDocumentStatus.ready
        doc.error_message = None
    except ExtractError as exc:
        doc.status = KnowledgeDocumentStatus.failed
        doc.error_message = str(exc)[:500]
        doc.extracted_text = None

    await session.flush()
    if doc.status == KnowledgeDocumentStatus.ready:
        await reindex_tenant_knowledge(session, tenant_id)
    return doc


async def delete_document(session: AsyncSession, *, tenant_id: str, document_id: str) -> bool:
    doc = (
        await session.execute(
            select(TenantKnowledgeDocument).where(
                TenantKnowledgeDocument.id == document_id,
                TenantKnowledgeDocument.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not doc:
        return False
    await session.delete(doc)
    await session.flush()
    await reindex_tenant_knowledge(session, tenant_id)
    return True


async def list_faqs(session: AsyncSession, tenant_id: str) -> list[TenantFaq]:
    rows = (
        await session.execute(
            select(TenantFaq)
            .where(TenantFaq.tenant_id == tenant_id)
            .order_by(TenantFaq.sort_order.asc(), TenantFaq.created_at.asc())
        )
    ).scalars().all()
    return list(rows)
