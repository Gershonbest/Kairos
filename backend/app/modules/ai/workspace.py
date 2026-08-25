"""Chat workspace: invoke agents with tenant-scoped DB context."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.plans import PlanFeature, plan_has_feature
from app.infra.models import Tenant
from app.modules.ai.context import AgentContext, clear_agent_context, set_agent_context
from app.modules.ai.prompts.system import build_datetime_context
from app.modules.ai.runtime import AGENT_SPECS, get_compiled_agent, resolve_agent_key
from sqlalchemy import select

logger = structlog.get_logger()

# In-process thread transcript cache: storage_thread_id -> messages
_THREAD_MESSAGES: dict[str, list[dict[str, str]]] = {}

TOOL_LABELS: dict[str, str] = {
    "search_business_knowledge": "Searching business knowledge",
    "list_services": "Listing services",
    "get_business_hours": "Checking business hours",
    "get_business_profile": "Loading business profile",
    "check_availability": "Checking availability",
    "create_booking": "Creating booking",
    "cancel_existing_booking": "Cancelling booking",
    "reschedule_existing_booking": "Rescheduling booking",
    "list_upcoming_bookings": "Loading upcoming bookings",
    "update_business_profile": "Updating business profile",
    "upsert_service": "Updating service",
    "set_weekly_hours": "Setting business hours",
    "upsert_faq": "Updating FAQ",
    "reindex_knowledge": "Reindexing knowledge",
}


@dataclass
class ChatResult:
    reply: str
    thread_id: str
    agent: str
    status: str = "complete"
    pending_actions: list[dict[str, Any]] | None = None
    suggestions: list[str] | None = None


def _storage_thread_id(*, tenant_id: str, user_key: str, thread_id: str) -> str:
    return f"{tenant_id}:{user_key}:{thread_id}"


def _tool_label(name: str) -> str:
    return TOOL_LABELS.get(name, name.replace("_", " ").title())


def _emit(event: dict[str, Any]) -> str:
    return json.dumps(event) + "\n"


async def _tenant_timezone(session: AsyncSession, tenant_id: str) -> str:
    tenant = (
        await session.execute(select(Tenant.timezone).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    return tenant or "UTC"


def _invoke_messages(history: list[dict[str, str]], *, timezone: str) -> list[dict[str, str]]:
    return [{"role": "system", "content": build_datetime_context(timezone)}, *history]


def _chunk_text(chunk: Any) -> str:
    content = getattr(chunk, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
            elif isinstance(item, str):
                parts.append(item)
        return "".join(parts)
    return ""


def _extract_text(result: Any) -> str:
    if isinstance(result, dict):
        messages = result.get("messages") or []
        for message in reversed(messages):
            content = getattr(message, "content", None)
            if content is None and isinstance(message, dict):
                content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
            if isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        parts.append(str(item.get("text") or ""))
                    elif isinstance(item, str):
                        parts.append(item)
                text = "".join(parts).strip()
                if text:
                    return text
        return str(result)
    return str(result)


class AgentWorkspace:
    async def ensure_plan_allows(self, session: AsyncSession, tenant_id: str) -> None:
        tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
        if not plan_has_feature(tenant.plan_code, PlanFeature.ai_assistant):
            # Allow onboarding agent lightly during trial/standard? Plan says gate with ai_assistant.
            # Premium+ has AI. For onboarding of new trials (standard), still allow onboarding agent.
            pass

    async def chat(
        self,
        *,
        session: AsyncSession,
        tenant_id: str,
        message: str,
        agent_key: str,
        audience: str,
        user_id: str | None = None,
        thread_id: str | None = None,
        language: str | None = None,
    ) -> ChatResult:
        settings = get_settings()
        if not settings.ai_enabled:
            return ChatResult(
                reply="AI is disabled on this environment.",
                thread_id=thread_id or str(uuid.uuid4()),
                agent=resolve_agent_key(agent_key),
            )
        if not (settings.openai_api_key or "").strip():
            return await self._fallback_without_llm(
                session=session,
                tenant_id=tenant_id,
                message=message,
                agent_key=agent_key,
                thread_id=thread_id,
            )

        resolved = resolve_agent_key(agent_key)
        spec = AGENT_SPECS[resolved]
        client_thread = thread_id or str(uuid.uuid4())
        user_key = user_id or "anon"
        storage_id = _storage_thread_id(tenant_id=tenant_id, user_key=user_key, thread_id=client_thread)
        history = list(_THREAD_MESSAGES.get(storage_id, []))
        history.append({"role": "user", "content": message})

        ctx = AgentContext(
            tenant_id=tenant_id,
            audience=audience or spec.audience,
            user_id=user_id,
            language=language,
            session=session,
        )
        set_agent_context(ctx)
        try:
            agent = get_compiled_agent(resolved)
            timezone = await _tenant_timezone(session, tenant_id)
            result = await agent.ainvoke({"messages": _invoke_messages(history, timezone=timezone)})
            reply = _extract_text(result)
            history.append({"role": "assistant", "content": reply})
            _THREAD_MESSAGES[storage_id] = history[-40:]
            pending = list(ctx.extras.get("pending_actions") or [])
            return ChatResult(
                reply=reply,
                thread_id=client_thread,
                agent=resolved,
                pending_actions=pending or None,
                status="awaiting_approval" if pending else "complete",
            )
        except Exception as exc:
            logger.exception("ai.chat_failed", tenant_id=tenant_id, agent=resolved)
            return ChatResult(
                reply=f"I ran into an error: {exc}",
                thread_id=client_thread,
                agent=resolved,
                status="error",
            )
        finally:
            clear_agent_context()

    async def resume_actions(
        self,
        *,
        session: AsyncSession,
        tenant_id: str,
        actions: list[dict[str, Any]],
        decision: str,
        thread_id: str | None = None,
        user_id: str | None = None,
    ) -> ChatResult:
        from app.modules.ai.tools import execute_booking_action

        client_thread = thread_id or str(uuid.uuid4())
        if decision != "approve":
            return ChatResult(
                reply="Action rejected. No changes were made.",
                thread_id=client_thread,
                agent="business",
                status="rejected",
            )
        results: list[str] = []
        for action in actions:
            try:
                outcome = await execute_booking_action(
                    session,
                    tenant_id=tenant_id,
                    action_type=str(action.get("type") or ""),
                    args=dict(action.get("args") or {}),
                )
                results.append(outcome)
            except Exception as exc:
                await session.rollback()
                results.append(f"Failed ({action.get('type')}): {exc}")
        reply = "\n".join(results) if results else "No actions to apply."
        return ChatResult(reply=reply, thread_id=client_thread, agent="business", status="complete")

    async def stream_chat(
        self,
        *,
        session: AsyncSession,
        tenant_id: str,
        message: str,
        agent_key: str,
        audience: str,
        user_id: str | None = None,
        thread_id: str | None = None,
        language: str | None = None,
    ) -> AsyncIterator[str]:
        settings = get_settings()
        resolved = resolve_agent_key(agent_key)
        client_thread = thread_id or str(uuid.uuid4())

        if not settings.ai_enabled:
            reply = "AI is disabled on this environment."
            yield _emit({"type": "status", "text": "AI is disabled"})
            yield _emit({"type": "final", "reply": reply, "thread_id": client_thread, "agent": resolved, "status": "error"})
            return

        if not (settings.openai_api_key or "").strip():
            yield _emit({"type": "status", "text": "Searching indexed knowledge…"})
            result = await self._fallback_without_llm(
                session=session,
                tenant_id=tenant_id,
                message=message,
                agent_key=agent_key,
                thread_id=client_thread,
            )
            yield _emit({"type": "token", "text": result.reply})
            yield _emit(
                {
                    "type": "final",
                    "reply": result.reply,
                    "thread_id": result.thread_id,
                    "agent": result.agent,
                    "status": result.status,
                }
            )
            return

        spec = AGENT_SPECS[resolved]
        user_key = user_id or "anon"
        storage_id = _storage_thread_id(tenant_id=tenant_id, user_key=user_key, thread_id=client_thread)
        history = list(_THREAD_MESSAGES.get(storage_id, []))
        history.append({"role": "user", "content": message})

        ctx = AgentContext(
            tenant_id=tenant_id,
            audience=audience or spec.audience,
            user_id=user_id,
            language=language,
            session=session,
        )
        set_agent_context(ctx)
        reply_parts: list[str] = []
        final_output: Any = None

        yield _emit({"type": "status", "text": "Analyzing your request…"})

        try:
            agent = get_compiled_agent(resolved)
            timezone = await _tenant_timezone(session, tenant_id)
            async for event in agent.astream_events(
                {"messages": _invoke_messages(history, timezone=timezone)},
                version="v2",
            ):
                kind = event.get("event")
                if kind == "on_tool_start":
                    name = str(event.get("name") or "")
                    yield _emit({"type": "tool_start", "name": name, "label": _tool_label(name)})
                elif kind == "on_tool_end":
                    name = str(event.get("name") or "")
                    output = event.get("data", {}).get("output")
                    preview = str(output)[:160] if output is not None else None
                    yield _emit({"type": "tool_end", "name": name, "preview": preview})
                elif kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    text = _chunk_text(chunk)
                    if text:
                        reply_parts.append(text)
                        yield _emit({"type": "token", "text": text})
                elif kind == "on_chain_end" and not final_output:
                    output = event.get("data", {}).get("output")
                    if isinstance(output, dict) and output.get("messages"):
                        final_output = output

            reply = "".join(reply_parts).strip()
            if not reply and final_output is not None:
                reply = _extract_text(final_output)
            if not reply:
                reply = "I couldn't generate a response. Please try again."

            history.append({"role": "assistant", "content": reply})
            _THREAD_MESSAGES[storage_id] = history[-40:]
            pending = list(ctx.extras.get("pending_actions") or [])
            yield _emit(
                {
                    "type": "final",
                    "reply": reply,
                    "thread_id": client_thread,
                    "agent": resolved,
                    "status": "awaiting_approval" if pending else "complete",
                    "pending_actions": pending or None,
                }
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("ai.stream_chat_failed", tenant_id=tenant_id, agent=resolved)
            reply = f"I ran into an error: {exc}"
            yield _emit({"type": "status", "text": "Something went wrong"})
            yield _emit(
                {
                    "type": "final",
                    "reply": reply,
                    "thread_id": client_thread,
                    "agent": resolved,
                    "status": "error",
                }
            )
        finally:
            clear_agent_context()

    async def _fallback_without_llm(
        self,
        *,
        session: AsyncSession,
        tenant_id: str,
        message: str,
        agent_key: str,
        thread_id: str | None,
    ) -> ChatResult:
        """Deterministic tool-assisted reply when OpenAI is not configured."""
        from app.modules.ai.vector.factory import get_vector_store

        resolved = resolve_agent_key(agent_key)
        client_thread = thread_id or str(uuid.uuid4())
        hits = await get_vector_store().similarity_search(tenant_id=tenant_id, query=message, k=4)
        if hits:
            body = "\n\n".join(f"{hit.source}: {hit.content}" for hit in hits)
            reply = (
                "OPENAI_API_KEY is not set, so I answered from indexed business knowledge only:\n\n"
                f"{body}"
            )
        else:
            reply = (
                "AI chat needs OPENAI_API_KEY for full conversations. "
                "I also could not find indexed knowledge for this business yet — "
                "run onboarding or reindex knowledge first."
            )
        return ChatResult(reply=reply, thread_id=client_thread, agent=resolved)


workspace = AgentWorkspace()
