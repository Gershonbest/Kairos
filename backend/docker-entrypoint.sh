#!/bin/sh
set -e

# Render injects PORT (often 10000). Local compose / plain Docker default to 8000.
PORT="${PORT:-8000}"

# Never silently create a local SQLite database in production. Render must
# receive the Neon connection string through its DATABASE_URL environment var.
if [ "${APP_ENV:-dev}" = "production" ]; then
    if [ -z "${DATABASE_URL:-}" ]; then
        echo "ERROR: DATABASE_URL is required when APP_ENV=production." >&2
        exit 1
    fi
    case "$DATABASE_URL" in
        sqlite*)
            echo "ERROR: Production DATABASE_URL must point to PostgreSQL/Neon, not SQLite." >&2
            exit 1
            ;;
    esac
fi

alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
