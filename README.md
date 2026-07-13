# Kairos Bookings

Multi-tenant booking platform with public booking pages, tenant dashboard, payments, and smart scheduling.

## Quick start

```bash
# Frontend
npm install && npm run dev

# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env   # configure DATABASE_URL, etc.
.venv/bin/alembic upgrade head
cd app && python main.py
```

- Frontend: http://localhost:5173  
- API docs: http://localhost:8000/docs  

## Developer documentation

See **[docs/DEVELOPERS.md](docs/DEVELOPERS.md)** for architecture, API reference, conventions, and how to add new features.
