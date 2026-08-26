"""AI vector store and tenant isolation tests."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.infra.models import Base, KnowledgeDocumentStatus, Service, Tenant, TenantFaq, TenantKnowledgeDocument, User, UserRole
from app.modules.ai.knowledge.documents import build_tenant_documents
from app.modules.ai.knowledge.indexer import reindex_tenant_knowledge
from app.modules.ai.vector.base import KnowledgeDocument
from app.modules.ai.vector.memory_store import InMemoryVectorStore
from app.modules.bookings.service import (
    BookingServiceError,
    cancel_booking,
    create_confirmed_booking,
    get_or_create_client,
    reschedule_booking,
)
from datetime import UTC, datetime, timedelta


@pytest.mark.asyncio
async def test_memory_vector_store_tenant_isolation() -> None:
    store = InMemoryVectorStore()
    await store.upsert(
        tenant_id="t1",
        docs=[KnowledgeDocument(id="a", source="profile", content="Bliss Spa facial pricing")],
    )
    await store.upsert(
        tenant_id="t2",
        docs=[KnowledgeDocument(id="b", source="profile", content="Clinic X dental pricing")],
    )
    hits_t1 = await store.similarity_search(tenant_id="t1", query="facial price", k=3)
    hits_t2 = await store.similarity_search(tenant_id="t2", query="dental", k=3)
    assert hits_t1
    assert all("Bliss" in hit.content or "facial" in hit.content.lower() for hit in hits_t1)
    assert hits_t2
    assert all(hit.id != "a" for hit in hits_t2)


async def _session() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return factory()


@pytest.mark.asyncio
async def test_build_tenant_documents_includes_faq_and_policy() -> None:
    session = await _session()
    async with session:
        tenant = Tenant(
            name="Bliss Spa",
            timezone="Africa/Lagos",
            cancellation_policy="Cancel 24h ahead",
            booking_policies="Walk-ins welcome when free",
        )
        session.add(tenant)
        await session.flush()
        session.add(
            Service(
                tenant_id=tenant.id,
                name="Facial",
                duration_minutes=60,
                price_amount=25000,
                deposit_amount=5000,
                active=True,
            )
        )
        session.add(
            TenantFaq(
                tenant_id=tenant.id,
                question="Do you take walk-ins?",
                answer="Yes when a slot is free.",
            )
        )
        await session.flush()
        docs = await build_tenant_documents(session, tenant.id)
        sources = {doc.source for doc in docs}
        assert "profile" in sources
        assert "service" in sources
        assert "faq" in sources
        assert "policy" in sources


@pytest.mark.asyncio
async def test_booking_service_create_cancel_reschedule(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MESSAGING_DRY_RUN", "true")
    session = await _session()
    async with session:
        tenant = Tenant(name="Bliss Spa", timezone="Africa/Lagos", plan_code="premium")
        session.add(tenant)
        await session.flush()
        service = Service(
            tenant_id=tenant.id,
            name="Facial",
            duration_minutes=60,
            price_amount=10000,
            deposit_amount=0,
            active=True,
        )
        session.add(service)
        await session.flush()
        session.add(
            User(
                tenant_id=tenant.id,
                full_name="Ada Owner",
                email="owner-bliss@example.com",
                role=UserRole.tenant_admin,
                is_active=True,
                is_bookable=True,
            )
        )
        await session.flush()
        client = await get_or_create_client(
            session,
            tenant_id=tenant.id,
            email="ada@example.com",
            first_name="Ada",
            last_name="Okafor",
            phone="+2348012345678",
        )
        start = datetime.now(UTC) + timedelta(days=2)
        booking = await create_confirmed_booking(
            session,
            tenant=tenant,
            service=service,
            client=client,
            start_at=start,
        )
        assert booking.id
        new_start = start + timedelta(hours=3)
        moved = await reschedule_booking(
            session,
            tenant=tenant,
            booking_id=booking.id,
            new_start_at=new_start,
            client_email="ada@example.com",
        )
        assert moved.start_at.replace(tzinfo=UTC) == new_start.replace(tzinfo=UTC) or abs(
            (moved.start_at - new_start).total_seconds()
        ) < 1
        with pytest.raises(BookingServiceError):
            await cancel_booking(
                session,
                tenant_id=tenant.id,
                booking_id=booking.id,
                client_email="wrong@example.com",
            )
        cancelled = await cancel_booking(
            session,
            tenant_id=tenant.id,
            booking_id=booking.id,
            client_email="ada@example.com",
        )
        assert cancelled.status.value == "cancelled"


@pytest.mark.asyncio
async def test_reindex_uses_memory_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VECTOR_STORE_PROVIDER", "memory")
    from app.core.config import get_settings
    from app.modules.ai.vector import factory as factory_mod

    get_settings.cache_clear()
    factory_mod.get_vector_store.cache_clear()

    session = await _session()
    async with session:
        tenant = Tenant(name="Bliss Spa", timezone="Africa/Lagos", public_description="Luxury spa")
        session.add(tenant)
        await session.flush()
        count = await reindex_tenant_knowledge(session, tenant.id)
        assert count >= 1
        store = factory_mod.get_vector_store()
        hits = await store.similarity_search(tenant_id=tenant.id, query="spa", k=3)
        assert hits

    get_settings.cache_clear()
    factory_mod.get_vector_store.cache_clear()


@pytest.mark.asyncio
async def test_hitl_queues_internal_booking_mutations() -> None:
    from app.modules.ai.context import AgentContext, clear_agent_context, set_agent_context
    from app.modules.ai.tools import create_booking

    session = await _session()
    async with session:
        ctx = AgentContext(tenant_id="t1", audience="internal", session=session)
        set_agent_context(ctx)
        try:
            result = await create_booking.ainvoke(
                {
                    "service_id": "svc",
                    "start_at": "2026-09-01T10:00:00+00:00",
                    "client_email": "ada@example.com",
                }
            )
            assert "PENDING_APPROVAL" in result
            assert ctx.extras.get("pending_actions")
            assert ctx.extras["pending_actions"][0]["type"] == "create_booking"
        finally:
            clear_agent_context()


@pytest.mark.asyncio
async def test_chunk_text_and_document_indexing(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.modules.ai.knowledge.chunking import chunk_text
    from app.modules.ai.knowledge.extract import extract_text_from_bytes

    assert len(chunk_text("short")) == 1
    long = "x" * 2500
    chunks = chunk_text(long, chunk_size=1000, overlap=100)
    assert len(chunks) >= 2

    text = extract_text_from_bytes(
        data=b"# Menu\nFacial 60 min",
        content_type="text/markdown",
        filename="menu.md",
    )
    assert "Facial" in text

    monkeypatch.setenv("VECTOR_STORE_PROVIDER", "memory")
    from app.core.config import get_settings
    from app.modules.ai.vector import factory as factory_mod

    get_settings.cache_clear()
    factory_mod.get_vector_store.cache_clear()

    session = await _session()
    async with session:
        tenant = Tenant(name="Bliss Spa", timezone="Africa/Lagos")
        session.add(tenant)
        await session.flush()
        session.add(
            TenantKnowledgeDocument(
                tenant_id=tenant.id,
                title="House rules",
                filename="rules.txt",
                content_type="text/plain",
                storage_url="http://localhost/rules.txt",
                extracted_text="Guests must arrive 10 minutes early.",
                status=KnowledgeDocumentStatus.ready,
                byte_size=40,
            )
        )
        await session.flush()
        docs = await build_tenant_documents(session, tenant.id)
        assert any(doc.source == "document" for doc in docs)

    get_settings.cache_clear()
    factory_mod.get_vector_store.cache_clear()


@pytest.mark.asyncio
async def test_workspace_fallback_without_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VECTOR_STORE_PROVIDER", "memory")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    from app.core.config import get_settings
    from app.modules.ai.vector import factory as factory_mod
    from app.modules.ai.workspace import workspace

    get_settings.cache_clear()
    factory_mod.get_vector_store.cache_clear()

    session = await _session()
    async with session:
        tenant = Tenant(name="Bliss Spa", timezone="Africa/Lagos", public_description="Luxury spa facial")
        session.add(tenant)
        await session.flush()
        await reindex_tenant_knowledge(session, tenant.id)
        result = await workspace.chat(
            session=session,
            tenant_id=tenant.id,
            message="What do you offer?",
            agent_key="public_booking",
            audience="external",
        )
        assert result.reply
        assert "OPENAI_API_KEY" in result.reply or "spa" in result.reply.lower()

    get_settings.cache_clear()
    factory_mod.get_vector_store.cache_clear()
