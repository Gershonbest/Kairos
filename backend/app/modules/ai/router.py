"""AI assistant and agent chat endpoints."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.core.plans import PlanFeature, plan_has_feature
from app.infra.cache import redis_cache
from app.infra.db import SessionLocal, get_db_session
from app.infra.models import Booking, Client, Service, Tenant, TenantFaq
from app.infra.storage import object_storage
from app.modules.ai.knowledge.indexer import reindex_tenant_knowledge
from app.modules.ai.knowledge.service import (
    MAX_DOCS_PER_TENANT,
    count_documents,
    create_document_from_upload,
    delete_document,
    list_documents,
    list_faqs,
    serialize_document,
    serialize_faq,
)
from app.modules.ai.runtime import AGENT_SPECS
from app.modules.ai.workspace import workspace
from app.modules.clients.names import visit_display_name
from app.modules.scheduling.service import (
    build_scheduling_insights,
    format_insights_reply,
    load_scheduling_context,
)

router = APIRouter()

TENANT_CACHE = "tenant:me"


class AssistantRequest(BaseModel):
    message: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    agent: str | None = None
    thread_id: str | None = None
    language: str | None = None


class ChatResponse(BaseModel):
    reply: str
    thread_id: str
    agent: str
    status: str = "complete"
    suggestions: list[str] | None = None
    pending_actions: list[dict] | None = None


class ResumeRequest(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    actions: list[dict] = Field(default_factory=list)
    thread_id: str | None = None


class KnowledgePoliciesUpdate(BaseModel):
    cancellation_policy: str | None = None
    booking_policies: str | None = None


class FaqUpsertRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1)
    faq_id: str | None = None


async def _require_ai_tenant(
    current_user: CurrentUser,
    session: AsyncSession,
    *,
    allow_standard_onboarding: bool = False,
    agent_key: str | None = None,
) -> str:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")
    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one()
    if allow_standard_onboarding and agent_key == "onboarding":
        return tenant.id
    if not plan_has_feature(tenant.plan_code, PlanFeature.ai_assistant):
        raise HTTPException(
            status_code=402,
            detail="AI assistant is available on Premium and Enterprise plans",
        )
    return tenant.id


@router.get("/agents")
async def list_agents(
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
) -> list[dict]:
    return [
        {"key": spec.key, "description": spec.description, "audience": spec.audience}
        for spec in AGENT_SPECS.values()
        if spec.audience == "internal"
    ]


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> ChatResponse:
    agent_key = payload.agent or "business"
    tenant_id = await _require_ai_tenant(
        current_user,
        session,
        allow_standard_onboarding=True,
        agent_key=agent_key,
    )
    result = await workspace.chat(
        session=session,
        tenant_id=tenant_id,
        message=payload.message,
        agent_key=agent_key,
        audience="internal",
        user_id=current_user.id,
        thread_id=payload.thread_id,
        language=payload.language,
    )
    return ChatResponse(
        reply=result.reply,
        thread_id=result.thread_id,
        agent=result.agent,
        status=result.status,
        suggestions=result.suggestions,
        pending_actions=result.pending_actions,
    )


@router.post("/chat/resume", response_model=ChatResponse)
async def chat_resume(
    payload: ResumeRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> ChatResponse:
    tenant_id = await _require_ai_tenant(current_user, session)
    result = await workspace.resume_actions(
        session=session,
        tenant_id=tenant_id,
        actions=payload.actions,
        decision=payload.decision,
        thread_id=payload.thread_id,
        user_id=current_user.id,
    )
    return ChatResponse(
        reply=result.reply,
        thread_id=result.thread_id,
        agent=result.agent,
        status=result.status,
    )


@router.post("/chat/stream")
async def chat_stream(
    payload: ChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
) -> StreamingResponse:
    agent_key = payload.agent or "business"
    async with SessionLocal() as session:
        tenant_id = await _require_ai_tenant(
            current_user,
            session,
            allow_standard_onboarding=True,
            agent_key=agent_key,
        )

    async def event_gen():
        try:
            async with SessionLocal() as session:
                async for chunk in workspace.stream_chat(
                    session=session,
                    tenant_id=tenant_id,
                    message=payload.message,
                    agent_key=agent_key,
                    audience="internal",
                    user_id=current_user.id,
                    thread_id=payload.thread_id,
                    language=payload.language,
                ):
                    yield chunk
        except asyncio.CancelledError:
            # Client closed the stream (navigated away, minimized Orion, etc.).
            raise

    return StreamingResponse(event_gen(), media_type="application/x-ndjson")


@router.post("/assistant")
async def ask_assistant(
    payload: AssistantRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Legacy keyword endpoint + LLM business agent when configured."""
    tenant_id = await _require_ai_tenant(current_user, session)
    result = await workspace.chat(
        session=session,
        tenant_id=tenant_id,
        message=payload.message,
        agent_key="business",
        audience="internal",
        user_id=current_user.id,
    )

    # Keep insights payload for existing UI cards.
    from_dt = datetime.now(UTC)
    to_dt = from_dt + timedelta(days=14)
    rules, bookings, services, calendar_blocks = await load_scheduling_context(
        session, tenant_id, from_dt=from_dt, to_dt=to_dt
    )
    insights = build_scheduling_insights(
        rules=rules,
        bookings=bookings,
        services=services,
        calendar_blocks=calendar_blocks,
        from_dt=from_dt,
        to_dt=to_dt,
    )
    upcoming_rows = (
        await session.execute(
            select(Booking, Client, Service)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .where(
                Booking.tenant_id == tenant_id,
                Booking.start_at >= from_dt,
                Booking.start_at <= to_dt,
            )
            .order_by(Booking.start_at.asc())
            .limit(8)
        )
    ).all()
    bookings_meta = [
        {
            "client_name": visit_display_name(booking, client),
            "service_name": service.name,
            "start_label": booking.start_at.strftime("%a, %b %d at %I:%M %p").replace(" 0", " "),
        }
        for booking, client, service in upcoming_rows
    ]
    _legacy_reply, suggestions = format_insights_reply(payload.message, insights, bookings_meta)
    return {
        "reply": result.reply,
        "suggestions": suggestions,
        "insights": insights,
        "thread_id": result.thread_id,
        "agent": result.agent,
    }


@router.get("/knowledge/documents")
async def get_knowledge_documents(
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant_id = await _require_ai_tenant(current_user, session)
    docs = await list_documents(session, tenant_id)
    return {
        "documents": [serialize_document(doc) for doc in docs],
        "limit": MAX_DOCS_PER_TENANT,
        "count": len(docs),
    }


@router.post("/knowledge/documents")
async def upload_knowledge_document(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant_id = await _require_ai_tenant(current_user, session)
    existing = await count_documents(session, tenant_id)
    if existing >= MAX_DOCS_PER_TENANT:
        raise HTTPException(
            status_code=400,
            detail=f"Document limit reached ({MAX_DOCS_PER_TENANT}). Delete one to upload another.",
        )
    storage_url, data, content_type, byte_size = await object_storage.upload_tenant_knowledge_file(
        tenant_id=tenant_id,
        file=file,
    )
    doc = await create_document_from_upload(
        session,
        tenant_id=tenant_id,
        title=(title or file.filename or "Document").strip(),
        filename=file.filename or "document",
        content_type=content_type,
        storage_url=storage_url,
        data=data,
        byte_size=byte_size,
    )
    await session.commit()
    return serialize_document(doc)


@router.delete("/knowledge/documents/{document_id}")
async def remove_knowledge_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant_id = await _require_ai_tenant(current_user, session)
    deleted = await delete_document(session, tenant_id=tenant_id, document_id=document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    await session.commit()
    return {"ok": True}


@router.post("/knowledge/reindex")
async def reindex_knowledge(
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant_id = await _require_ai_tenant(current_user, session)
    count = await reindex_tenant_knowledge(session, tenant_id)
    await session.commit()
    return {"ok": True, "chunks": count}


@router.get("/knowledge/faqs")
async def get_knowledge_faqs(
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    tenant_id = await _require_ai_tenant(current_user, session)
    faqs = await list_faqs(session, tenant_id)
    return [serialize_faq(faq) for faq in faqs]


@router.post("/knowledge/faqs")
async def upsert_knowledge_faq(
    payload: FaqUpsertRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant_id = await _require_ai_tenant(current_user, session)
    faq: TenantFaq | None = None
    if payload.faq_id:
        faq = (
            await session.execute(
                select(TenantFaq).where(TenantFaq.id == payload.faq_id, TenantFaq.tenant_id == tenant_id)
            )
        ).scalar_one_or_none()
        if not faq:
            raise HTTPException(status_code=404, detail="FAQ not found")
    if not faq:
        faq = TenantFaq(tenant_id=tenant_id, question=payload.question.strip(), answer=payload.answer.strip())
        session.add(faq)
    else:
        faq.question = payload.question.strip()[:500]
        faq.answer = payload.answer.strip()
    await session.flush()
    await reindex_tenant_knowledge(session, tenant_id)
    await session.commit()
    return serialize_faq(faq)


@router.delete("/knowledge/faqs/{faq_id}")
async def delete_knowledge_faq(
    faq_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant_id = await _require_ai_tenant(current_user, session)
    faq = (
        await session.execute(
            select(TenantFaq).where(TenantFaq.id == faq_id, TenantFaq.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ not found")
    await session.delete(faq)
    await session.flush()
    await reindex_tenant_knowledge(session, tenant_id)
    await session.commit()
    return {"ok": True}


@router.put("/knowledge/policies")
async def update_knowledge_policies(
    payload: KnowledgePoliciesUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(require_active_subscription),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    tenant_id = await _require_ai_tenant(current_user, session)
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    if payload.cancellation_policy is not None:
        tenant.cancellation_policy = payload.cancellation_policy.strip() or None
    if payload.booking_policies is not None:
        tenant.booking_policies = payload.booking_policies.strip() or None
    await session.flush()
    await reindex_tenant_knowledge(session, tenant_id)
    await session.commit()
    await redis_cache.invalidate_tenant(tenant_id, TENANT_CACHE)
    return {
        "ok": True,
        "cancellation_policy": tenant.cancellation_policy,
        "booking_policies": tenant.booking_policies,
    }
