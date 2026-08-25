"""Thread memory helpers for AI agents.

Phase 1 keeps short-term transcripts in-process (see workspace.py).
When a dedicated checkpoint DB is configured, callers can use AI_CHECKPOINT_DATABASE_URL
to point LangGraph checkpointers at Postgres without changing tool code.
"""

from __future__ import annotations

from app.core.config import get_settings


def checkpoint_database_url() -> str:
    settings = get_settings()
    return (settings.ai_checkpoint_database_url or settings.database_url or "").strip()
