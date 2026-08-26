"""Embedding helpers for knowledge indexing."""

from __future__ import annotations

import hashlib
import math
import struct

import structlog

from app.core.config import get_settings

logger = structlog.get_logger()

DEFAULT_DIM = 1536


def _normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return float(sum(x * y for x, y in zip(a, b, strict=True)))


def deterministic_embedding(text: str, *, dim: int = DEFAULT_DIM) -> list[float]:
    """Hash-based embedding for tests/dev when OpenAI is not configured."""
    seed = hashlib.sha256(text.encode("utf-8")).digest()
    values: list[float] = []
    counter = 0
    while len(values) < dim:
        block = hashlib.sha256(seed + counter.to_bytes(4, "big")).digest()
        for i in range(0, len(block) - 3, 4):
            raw = struct.unpack_from(">i", block, i)[0]
            values.append((raw / 2_147_483_647.0))
            if len(values) >= dim:
                break
        counter += 1
    return _normalize(values)


async def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    settings = get_settings()
    api_key = (settings.openai_api_key or "").strip()
    if not api_key:
        return [deterministic_embedding(text) for text in texts]
    try:
        from langchain_openai import OpenAIEmbeddings

        embeddings = OpenAIEmbeddings(
            model=settings.openai_embedding_model,
            api_key=api_key,
        )
        vectors = await embeddings.aembed_documents(texts)
        return [_normalize([float(v) for v in row]) for row in vectors]
    except Exception:
        logger.exception("ai.embed_failed_falling_back")
        return [deterministic_embedding(text) for text in texts]


async def embed_query(text: str) -> list[float]:
    rows = await embed_texts([text])
    return rows[0]
