"""Per-invocation AI agent context (tenant-scoped)."""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class AgentContext:
    tenant_id: str
    audience: str = "internal"  # internal | external
    user_id: str | None = None
    language: str | None = None
    session: AsyncSession | None = None
    extras: dict[str, Any] = field(default_factory=dict)


_agent_context: ContextVar[AgentContext | None] = ContextVar("orheo_agent_context", default=None)


def set_agent_context(ctx: AgentContext) -> None:
    _agent_context.set(ctx)


def get_agent_context() -> AgentContext:
    ctx = _agent_context.get()
    if ctx is None:
        raise RuntimeError("AI agent context is not set")
    return ctx


def clear_agent_context() -> None:
    _agent_context.set(None)
