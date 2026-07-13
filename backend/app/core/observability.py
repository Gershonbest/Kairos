"""HTTP request metrics and observability middleware."""

import time
import uuid
from collections import defaultdict
from collections.abc import Callable

import structlog
from fastapi import Request, Response

logger = structlog.get_logger(__name__)
REQUEST_COUNT: dict[str, int] = defaultdict(int)
REQUEST_LATENCY_MS: dict[str, float] = defaultdict(float)


async def request_observability_middleware(request: Request, call_next: Callable) -> Response:
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    path_key = f"{request.method} {request.url.path}"
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000

    REQUEST_COUNT[path_key] += 1
    REQUEST_LATENCY_MS[path_key] = elapsed_ms
    response.headers["x-request-id"] = request_id
    logger.info(
        "request_complete",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        elapsed_ms=round(elapsed_ms, 2),
    )
    return response
