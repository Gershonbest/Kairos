"""AgentSpec registry and LangChain agent construction."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

import structlog
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

from app.core.config import get_settings
from app.modules.ai import prompts
from app.modules.ai.tools import BUSINESS_TOOLS, ONBOARDING_TOOLS, PUBLIC_TOOLS

logger = structlog.get_logger()


@dataclass(frozen=True)
class AgentSpec:
    key: str
    description: str
    prompt_builder: Callable[[], str]
    tools: Sequence
    audience: str = "internal"


PUBLIC_BOOKING_SPEC = AgentSpec(
    key="public_booking",
    description="Public booking assistant for customers of one business.",
    prompt_builder=prompts.system.build_public_booking_prompt,
    tools=PUBLIC_TOOLS,
    audience="external",
)

ONBOARDING_SPEC = AgentSpec(
    key="onboarding",
    description="AI onboarding assistant that configures a new business from plain language.",
    prompt_builder=prompts.system.build_onboarding_prompt,
    tools=ONBOARDING_TOOLS,
    audience="internal",
)

BUSINESS_SPEC = AgentSpec(
    key="business",
    description="Owner dashboard assistant for operations and insights.",
    prompt_builder=prompts.system.build_business_prompt,
    tools=BUSINESS_TOOLS,
    audience="internal",
)

AGENT_SPECS: dict[str, AgentSpec] = {
    PUBLIC_BOOKING_SPEC.key: PUBLIC_BOOKING_SPEC,
    ONBOARDING_SPEC.key: ONBOARDING_SPEC,
    BUSINESS_SPEC.key: BUSINESS_SPEC,
}

DEFAULT_AGENT_KEY = BUSINESS_SPEC.key


def resolve_agent_key(role: str | None) -> str:
    if role and role in AGENT_SPECS:
        return role
    return DEFAULT_AGENT_KEY


def build_agent_from_spec(spec: AgentSpec):
    settings = get_settings()
    api_key = (settings.openai_api_key or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for AI agents")
    model = ChatOpenAI(
        model=settings.openai_model,
        temperature=settings.openai_temperature,
        api_key=api_key,
    )
    return create_agent(
        model=model,
        tools=list(spec.tools),
        system_prompt=spec.prompt_builder(),
    )


_agent_cache: dict[str, object] = {}


def get_compiled_agent(agent_key: str):
    key = resolve_agent_key(agent_key)
    if key not in _agent_cache:
        logger.info("ai.agent_build", key=key)
        _agent_cache[key] = build_agent_from_spec(AGENT_SPECS[key])
    return _agent_cache[key]
