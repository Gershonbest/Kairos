"""FastAPI application entrypoint, middleware, and health endpoints."""

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# When running `python main.py` from `backend/app`, force local project imports.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.observability import REQUEST_COUNT, REQUEST_LATENCY_MS, request_observability_middleware
from app.core.telemetry import configure_telemetry
from app.infra.cache import redis_client
from app.infra.db import engine
from app.infra.email import log_email_config_status

settings = get_settings()
configure_logging()
log_email_config_status()

app = FastAPI(title=settings.app_name, debug=settings.app_debug)
app.include_router(api_router)
app.middleware("http")(request_observability_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_origin_regex=settings.allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
configure_telemetry(app)

upload_root = Path(settings.local_upload_dir)
if not settings.s3_bucket_name:
    upload_root.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=str(upload_root)), name="media")


@app.get("/health/live")
async def liveness() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness() -> dict[str, str]:
    # Ensure core dependencies are reachable before receiving traffic.
    async with engine.connect() as connection:
        await connection.exec_driver_sql("SELECT 1")
    await redis_client.ping()
    return {"status": "ready"}


@app.get("/metrics")
async def metrics() -> dict:
    return {"request_count": dict(REQUEST_COUNT), "last_latency_ms": dict(REQUEST_LATENCY_MS)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)