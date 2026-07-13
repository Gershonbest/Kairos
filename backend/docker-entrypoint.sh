#!/bin/sh
set -e

# Render injects PORT (often 10000). Local compose / plain Docker default to 8000.
PORT="${PORT:-8000}"

alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
