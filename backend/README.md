# Kairos Bookings Backend

FastAPI modular monolith backend for Kairos Bookings.

## Quickstart

1. Create virtualenv and install:
   - `python -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install -e ".[dev]"`
2. Copy env file:
   - `cp .env.example .env`
3. Run migrations:
   - `alembic upgrade head`
4. Start API:
   - `uvicorn app.main:app --reload`

## Quality checks

- `ruff check .`
- `mypy app`
- `pytest`
