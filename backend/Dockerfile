# Backend: FastAPI API with Alembic migrations on startup.

FROM mirror.gcr.io/library/python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY docker-entrypoint.sh ./

RUN pip install --no-cache-dir -e . \
    && chmod +x docker-entrypoint.sh \
    && mkdir -p uploads

EXPOSE 8000

# Prefer runtime PORT (Render); fall back to 8000 for local runs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f\"http://127.0.0.1:{os.environ.get('PORT', '8000')}/health/live\")"

ENTRYPOINT ["./docker-entrypoint.sh"]
