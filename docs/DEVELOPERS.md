# Kairos Bookings — Developer Guide

This document is for engineers joining the project or building new features. It covers architecture, local setup, conventions, and how to extend the system safely.

---

## Table of contents

1. [Product overview](#product-overview)
2. [Architecture](#architecture)
3. [Repository layout](#repository-layout)
4. [Local development setup](#local-development-setup)
5. [Environment variables](#environment-variables)
6. [Database and migrations](#database-and-migrations)
7. [Authentication and authorization](#authentication-and-authorization)
8. [Multi-tenancy model](#multi-tenancy-model)
9. [Domain modules](#domain-modules)
10. [API reference](#api-reference)
11. [Frontend guide](#frontend-guide)
12. [Adding a new feature](#adding-a-new-feature)
13. [Conventions and patterns](#conventions-and-patterns)
14. [Email, uploads, and external services](#email-uploads-and-external-services)
15. [Testing and debugging](#testing-and-debugging)
16. [Known limitations and extension points](#known-limitations-and-extension-points)

---

## Product overview

**Kairos Bookings** is a multi-tenant SaaS booking platform. Each tenant (business) gets:

- A branded public booking page (`/book/:businessId`)
- A tenant dashboard for services, calendar, clients, payments, and AI scheduling
- An onboarding flow for business profile, services, availability, and payment provider setup
- A platform admin area for subscriber management

**User roles**

| Role | Description |
|------|-------------|
| `tenant_admin` | Business owner; full access to their tenant dashboard |
| `tenant_user` | Reserved for future team-member access |
| `platform_admin` | System admin (`/admin`) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  React + Vite frontend (port 5173)                              │
│  src/app/pages · src/lib/api/client.ts · React Router           │
└───────────────────────────┬─────────────────────────────────────┘
                            │ /api/v1/*  (Vite proxy in dev)
                            │ /media/*   (local uploads)
┌───────────────────────────▼─────────────────────────────────────┐
│  FastAPI backend (port 8000)                                    │
│  backend/app/modules/*  ·  backend/app/schemas/*                │
└───────┬─────────────────┬──────────────────┬────────────────────┘
        │                 │                  │
   PostgreSQL          Redis            Brevo / SMTP
   (Neon in prod)    (slot locks)       (email)
```

**Design principles**

- **Modular backend**: each domain (`auth`, `bookings`, `clients`, …) has its own `router.py` under `backend/app/modules/`.
- **Thin routers, fat services**: business logic lives in `service.py` / `helpers.py` where possible; routers validate input and orchestrate.
- **Single API client on frontend**: all HTTP calls go through `src/lib/api/client.ts`.
- **Tenant scoping**: almost every authenticated endpoint filters by `current_user.tenant_id`.

---

## Repository layout

```
Design Kairos Bookings/
├── src/                          # Frontend (React + TypeScript)
│   ├── app/
│   │   ├── pages/                # Route-level screens
│   │   │   ├── auth/             # Login, signup, verify email
│   │   │   ├── onboarding/       # 4-step tenant setup
│   │   │   ├── dashboard/        # Tenant dashboard pages
│   │   │   ├── public/           # Public booking flow
│   │   │   ├── admin/            # Platform admin
│   │   │   └── marketing/        # Landing page
│   │   ├── components/           # Reusable UI (forms, layouts, ui/)
│   │   └── routes.ts             # React Router config
│   ├── lib/
│   │   ├── api/client.ts         # Typed HTTP client + auth tokens
│   │   ├── auth/redirect.ts      # Post-login routing logic
│   │   └── data/                 # Static data (locations, availability)
│   └── main.tsx
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI entrypoint
│   │   ├── api/router.py         # Mounts all /api/v1 routes
│   │   ├── core/                 # Config, auth deps, security, logging
│   │   ├── infra/                # DB, Redis, email, storage, ORM models
│   │   ├── modules/              # Feature routers + services
│   │   └── schemas/              # Pydantic request/response models
│   ├── alembic/                  # Database migrations
│   ├── pyproject.toml
│   └── .env                      # Backend secrets (not committed)
├── docs/
│   └── DEVELOPERS.md             # This file
├── vite.config.ts                # Dev server + API proxy
└── package.json
```

---

## Local development setup

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **PostgreSQL** (or Neon cloud DB)
- **Redis** (for booking slot locks)

### 1. Frontend

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`. Vite proxies `/api` and `/media` to the backend.

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .
cp .env.example .env        # Edit with your values
```

Run migrations:

```bash
cd backend
.venv/bin/alembic upgrade head
```

Start the API:

```bash
cd backend/app
python main.py
```

API base: `http://localhost:8000`  
OpenAPI docs: `http://localhost:8000/docs`

### 3. Redis (optional but recommended)

Public booking uses Redis for short-lived slot locks. Without Redis, concurrent bookings on the same slot may conflict.

```bash
redis-server
```

Set `REDIS_URL=redis://localhost:6379/0` in `backend/.env`.

### 4. ngrok (for email links and mobile testing)

Verification and booking emails use `FRONTEND_BASE_URL`. For external testing:

1. Run `ngrok http 5173` (frontend proxy handles API)
2. Set in `backend/.env`:
   ```
   FRONTEND_BASE_URL=https://your-subdomain.ngrok-free.app
   PUBLIC_BOOKING_BASE_URL=https://your-subdomain.ngrok-free.app/book
   ```
3. Restart the backend (`get_settings()` is cached at startup)

`vite.config.ts` already allows `.ngrok-free.app` hosts and proxies API traffic.

---

## Environment variables

Copy `backend/.env.example` → `backend/.env`. Key variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Async PostgreSQL URL (`postgresql+asyncpg://...`). Use Neon pooler URL in production. |
| `REDIS_URL` | Redis for slot locking |
| `JWT_SECRET` | Signs access/refresh tokens |
| `FRONTEND_BASE_URL` | Base URL for email verification links |
| `PUBLIC_BOOKING_BASE_URL` | Base URL for public booking links in dashboard |
| `BREVO_API_KEY` | Brevo HTTP API key (`xkeysib-...`) — preferred for email |
| `SMTP_*` | SMTP fallback if Brevo API is unavailable |
| `GOOGLE_CLIENT_ID` | Google Sign-In (frontend + backend token verification) |
| `S3_BUCKET_NAME` | Required in production; if empty in dev, uploads use local disk |
| `S3_PUBLIC_BASE_URL` | Optional public/CDN base for uploaded object URLs |
| `S3_OBJECT_ACL` | Optional (e.g. `public-read`); leave empty if bucket ACLs are off |
| `LOCAL_UPLOAD_DIR` | Local upload folder for dev fallback (default: `uploads`) |
| `MEDIA_BASE_URL` | Public URL prefix for local files (`/media` in dev) |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | Platform admin login |
| `PAYSTACK_SECRET_KEY` | Paystack secret key (server) |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key (optional frontend) |
| `PAYSTACK_WEBHOOK_SECRET` | Webhook HMAC secret (defaults to secret key) |
| `PAYSTACK_PLATFORM_FEE_PERCENT` | Platform fee on booking payments (default `5`) |
| `PAYSTACK_CHANNELS` | Checkout methods (`card,bank,ussd,bank_transfer,qr`; OPay under `bank`) |
| `PAYSTACK_CALLBACK_BASE_URL` | Frontend origin for Paystack redirects |

Frontend optional env:

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Override API base (default: `/api/v1` via proxy) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `VITE_PAYSTACK_PUBLIC_KEY` | Optional Paystack public key for Inline JS |

---

## Database and migrations

**ORM**: SQLAlchemy 2.0 async models in `backend/app/infra/models.py`.

**Migrations**: Alembic in `backend/alembic/versions/`. Naming pattern: `YYYYMMDD_NN_description.py`.

```bash
# Apply all migrations
cd backend && .venv/bin/alembic upgrade head

# Create a new migration after model changes
.venv/bin/alembic revision -m "add_feature_x"
# Edit the generated file, then:
.venv/bin/alembic upgrade head
```

**Core tables**

| Table | Purpose |
|-------|---------|
| `tenants` | Business profile, location, branding, payment config |
| `users` | Auth users linked to a tenant |
| `services` | Bookable services (duration, price, deposit, buffer, location) |
| `availability_rules` | Weekly hours per day (`day_of_week` 0=Sun … 6=Sat) |
| `clients` | Customer records per tenant |
| `bookings` | Appointments with status, idempotency, format |
| `payment_transactions` | Deposits/payments linked to bookings |
| `webhook_events` | Payment webhook idempotency |
| `email_verification_tokens` | Email verification flow |
| `refresh_tokens` | JWT refresh token rotation |

**Day-of-week convention**

Availability uses `day_of_week` where **0 = Sunday, 1 = Monday, …, 6 = Saturday**. Public slot generation maps Python `date.weekday()` (Mon=0) via `(weekday + 1) % 7`.

---

## Authentication and authorization

### Token flow

1. Login/signup/verify-email returns `{ access_token, refresh_token }`.
2. Frontend stores tokens in `localStorage` (`kairos_access_token`, `kairos_refresh_token`).
3. `src/lib/api/client.ts` attaches `Authorization: Bearer <access_token>` on requests.
4. On 401, client clears tokens and redirects to `/auth/login`.

### Backend guard

```python
from app.core.deps import CurrentUser, get_current_user

@router.get("/example")
async def example(current_user: CurrentUser = Depends(get_current_user)):
    # current_user.id, current_user.tenant_id, current_user.role
    ...
```

Platform admin routes use `require_roles("platform_admin")`.

### Post-auth routing

`src/lib/auth/redirect.ts` → `resolvePostAuthPath()`:

- `onboarding_completed == false` → `/onboarding`
- Otherwise → `/dashboard`

Used after login, Google sign-in, and email verification.

---

## Multi-tenancy model

- Each **tenant** is a business.
- **Users** belong to one tenant (`users.tenant_id`).
- **All tenant data** (services, bookings, clients, etc.) is scoped by `tenant_id`.
- Public routes resolve tenant by `business_id` (UUID or `public_slug`).
- On first onboarding save, a `Tenant` row is created and linked to the user.

When adding new tables or endpoints, always filter by `tenant_id` for authenticated routes.

---

## Domain modules

### Bookings and public flow

| Path | Module |
|------|--------|
| `GET/PUT /availability` | Weekly hours (tenant dashboard + onboarding) |
| `GET /bookings` | List tenant bookings |
| `GET /public/businesses/{id}/services` | Public service catalog |
| `GET /public/businesses/{id}/availability` | Slot generation |
| `POST /public/businesses/{id}/bookings` | Create booking |
| `POST .../bookings/{id}/confirm-payment` | Complete deposit payment |

**Slot algorithm** (`backend/app/modules/scheduling/service.py`):

- Iterates enabled `availability_rules` per day
- Steps by service `duration_minutes` (min 15 min)
- Excludes overlapping `pending`/`confirmed` bookings
- Applies `buffer_minutes` after each booking

**Booking statuses**: `pending` → `confirmed` → `completed` / `cancelled`

### Payments (Paystack)

Full setup, activation, and troubleshooting: [`docs/PAYMENTS.md`](./PAYMENTS.md).

Kairos uses **Paystack** for two revenue streams:

1. **Booking deposits** — Client pays via Paystack; tenant receives settlement through a **subaccount**; Kairos keeps `PAYSTACK_PLATFORM_FEE_PERCENT` (set as subaccount `percentage_charge`).
2. **Tenant subscriptions** — Tenant pays Kairos via Paystack checkout (`POST /subscriptions/checkout`); no subaccount (100% to platform).

**Booking flow**

- Services can define `deposit_amount`; otherwise full `price_amount` is charged (NGN / kobo).
- If `tenant.payments_enabled` and a Paystack subaccount is connected, booking stays `pending` and the API returns `payment_authorization_url`.
- Client is redirected to Paystack; webhook `charge.success` (or `confirm-payment` verify) marks the tx succeeded and confirms the booking.
- If payments are not enabled, tx auto-succeeds with provider `kairos` (demo mode).

**Onboarding**

- Step 4 creates a Paystack subaccount (`POST /tenants/me/payment-provider`) with bank code + account number.
- Stores `payment_account_id` = `subaccount_code`. Do **not** store tenant API keys.

**Webhooks**

- `POST /api/v1/payments/webhooks/paystack` — verify `x-paystack-signature` (HMAC-SHA512 with `PAYSTACK_WEBHOOK_SECRET` or `PAYSTACK_SECRET_KEY`).
- Configure the same URL in the Paystack dashboard.

**Env vars**

| Variable | Purpose |
|----------|---------|
| `PAYSTACK_SECRET_KEY` | Server API |
| `PAYSTACK_PUBLIC_KEY` | Optional frontend Inline JS |
| `PAYSTACK_WEBHOOK_SECRET` | Webhook HMAC (defaults to secret key) |
| `PAYSTACK_PLATFORM_FEE_PERCENT` | Platform cut on booking payments (default 5) |
| `PAYSTACK_CALLBACK_BASE_URL` | Frontend origin for Paystack return URLs |

**Client helpers**: `backend/app/infra/paystack.py`

### Clients

- Auto-created on public booking (upsert by email per tenant).
- Dashboard CRUD: `GET/POST /clients`, `PATCH/DELETE /clients/{id}`.
- List response includes `total_bookings`, `total_spent`, `last_visit_at`.

### Smart scheduling / AI

- `GET /scheduling/insights` — gaps, utilization, recommended slots.
- `POST /ai/assistant` — natural-language responses using real calendar data (rule-based, not an external LLM).

### Uploads

- `POST /uploads/logo`, `POST /uploads/service-image`
- S3 when `S3_BUCKET_NAME` is set; otherwise local disk in dev (served at `/media/...`)
- Production requires S3 — uploads return 503 if the bucket is not configured
- Max 5 MB; JPEG, PNG, WebP, GIF

### Admin

- Login: `POST /auth/admin/login` with `SUPER_ADMIN_*` credentials
- UI: `/admin/login`, `/admin/subscribers`
- Can suspend tenants, change plans, delete tenants (cascades related data)

---

## API reference

Base URL: `/api/v1`

### Auth (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/signup` | No | Register + optional email verification |
| POST | `/verify-email` | No | Verify token; returns tokens + onboarding flag |
| POST | `/login` | No | Email/password login |
| POST | `/google` | No | Google ID token login/signup |
| POST | `/refresh` | No | Refresh access token |
| GET | `/me` | Yes | Current user profile |
| PATCH | `/me` | Yes | Update name/password |

### Tenant (`/tenants`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/me` | Tenant profile |
| PUT | `/me/onboarding` | Complete/update onboarding |
| PUT | `/me/public-profile` | Tagline, description, logo |
| GET/POST | `/me/payment-provider` | Paystack subaccount connect / status |
| GET | `/me/paystack/banks` | List settlement banks |
| GET | `/me/booking-links` | Public URLs |

### Core resources

| Prefix | Operations |
|--------|------------|
| `/services` | CRUD for bookable services |
| `/availability` | GET list, PUT replace weekly rules |
| `/bookings` | GET list |
| `/clients` | GET list, POST create, PATCH update, DELETE |
| `/payments/transactions` | GET payment history |
| `/payments/config` | GET public Paystack config |
| `/payments/intent` | POST create payment intent |
| `/payments/verify/{reference}` | POST verify Paystack payment |
| `/payments/webhooks/paystack` | POST Paystack webhooks |
| `/subscriptions/checkout` | POST start Paystack plan payment |
| `/scheduling/insights` | GET smart scheduling data |
| `/ai/assistant` | POST chat message |
| `/dashboard/summary` | GET stats for dashboard home |
| `/uploads/logo`, `/uploads/service-image` | POST multipart upload |

### Public (no auth)

| Path | Description |
|------|-------------|
| `/public/businesses/{id}` | Business profile |
| `/public/businesses/{id}/services` | Active services |
| `/public/businesses/{id}/availability` | Available slots |
| `/public/businesses/{id}/bookings` | Create booking |
| `/public/businesses/{id}/bookings/{id}/confirm-payment` | Confirm deposit |

Interactive docs: `http://localhost:8000/docs`

---

## Frontend guide

### Routing

All routes are defined in `src/app/routes.ts`:

| Area | Base path |
|------|-----------|
| Marketing | `/` |
| Auth | `/auth/login`, `/auth/signup`, `/auth/verify-email` |
| Onboarding | `/onboarding`, `/onboarding/services`, … |
| Dashboard | `/dashboard`, `/dashboard/calendar`, … |
| Public booking | `/book/:businessId` |
| Admin | `/admin/login`, `/admin/subscribers` |

### API client

Add new endpoints in `src/lib/api/client.ts`:

```typescript
export const api = {
  // ...
  myNewEndpoint: (id: string) =>
    request<MyType>(`/my-module/${id}`),
};
```

The `request()` helper handles JSON, auth headers, and error formatting.

### UI components

- **shadcn-style primitives** in `src/app/components/ui/` (Button, Card, Dialog, …)
- **Feature forms** in `src/app/components/forms/` (LocationFields, ImageUpload, WeeklyAvailabilityEditor)
- **Layouts**: `DashboardLayout`, `AuthLayout`, `PublicLayout`

### Styling

- Tailwind CSS v4 via `@tailwindcss/vite`
- Brand colors: purple `#7c3aed`, green `#22c55e`
- Use existing `Button`, `Card`, `Input` components for consistency

### File header comments

New source files should include a one-line purpose comment at the top (existing convention):

```typescript
// Dashboard page to view and edit weekly booking availability.
```

---

## Adding a new feature

Follow this checklist when shipping a vertical slice (API + UI):

### Backend

1. **Model** — Add columns/tables in `backend/app/infra/models.py` if needed.
2. **Migration** — `alembic revision -m "..."` and `upgrade head`.
3. **Schema** — Pydantic models in `backend/app/schemas/`.
4. **Module** — Create `backend/app/modules/<feature>/router.py` (+ `service.py` if logic is non-trivial).
5. **Register router** — Import and mount in `backend/app/api/router.py`.
6. **Tenant scope** — Always filter by `current_user.tenant_id` on protected routes.
7. **Test manually** — Use `/docs` or curl with a Bearer token.

### Frontend

1. **API method** — Add to `src/lib/api/client.ts`.
2. **Page or component** — Under `src/app/pages/` or `src/app/components/`.
3. **Route** — Register in `src/app/routes.ts`.
4. **Nav** — Add link in `DashboardLayout.tsx` if it's a dashboard feature.
5. **Error handling** — Display API errors from `err.message` (client parses FastAPI `detail`).

### Example: add a “Reminders” settings page

```
backend/app/modules/reminders/router.py
backend/app/schemas/reminders.py
src/app/pages/dashboard/ReminderSettings.tsx
src/lib/api/client.ts  → listReminders, updateReminders
src/app/routes.ts      → { path: "reminders", Component: ReminderSettings }
DashboardLayout.tsx    → nav item
```

---

## Conventions and patterns

### Backend

- **Async everywhere** — `async def` routes, `AsyncSession` for DB.
- **Idempotency** — Bookings and payments use `idempotency_key` to prevent duplicates.
- **Background tasks** — Emails sent via FastAPI `BackgroundTasks`, not blocking the response.
- **Config** — `get_settings()` from `app.core.config`; cached with `@lru_cache` (restart after `.env` changes).
- **Enums** — Stored as SQLAlchemy `Enum` (e.g. `BookingStatus`, `PaymentStatus`).

### Frontend

- **State** — React `useState` / `useEffect` for page-level data; no global store yet.
- **Forms** — Controlled inputs; validate before API calls where UX matters.
- **Loading** — Use `Button` `loading` prop where available.
- **Paths** — Prefer relative API paths (`/api/v1/...`) so Vite proxy works in dev.

### Git / code style

- Keep diffs focused; match surrounding naming and patterns.
- Backend: Ruff (line length 100) configured in `pyproject.toml`.
- Avoid committing `.env`, `uploads/`, or `.venv/`.

---

## Email, uploads, and external services

### Email (`backend/app/infra/email.py`)

Priority order:

1. **Brevo HTTP API** if `BREVO_API_KEY` is set (`xkeysib-...` only)
2. **SMTP fallback** (`SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`)

Brevo may require your server IP in [authorised IPs](https://app.brevo.com/security/authorised_ips).

### File uploads (`backend/app/infra/storage.py`)

- `S3_BUCKET_NAME` set → **new** uploads go to S3 (public URL from `S3_PUBLIC_BASE_URL` or the default bucket URL)
- Empty + `APP_ENV=dev` → local `LOCAL_UPLOAD_DIR`, served at `/media`
- Empty + `APP_ENV=production` → uploads fail with 503 (S3 required)
- `/media` is still mounted when S3 is on, so **legacy** local URLs in the DB keep working until re-uploaded

Recommended bucket setup:

1. Create a bucket and turn **off** Block Public Access (enough to allow a public bucket policy)
2. Attach a public-read **bucket policy** for `s3:GetObject` on `arn:aws:s3:::YOUR_BUCKET/*`
3. Set `S3_BUCKET_NAME`, `AWS_REGION`, credentials, and `S3_PUBLIC_BASE_URL`
4. Leave `S3_OBJECT_ACL` empty unless the bucket explicitly allows object ACLs

Without a public-read policy, uploads succeed but image `<img>` tags get **403** from S3.

### Google Sign-In

- Frontend: `@react-oauth/google` with `VITE_GOOGLE_CLIENT_ID`
- Backend: `GOOGLE_CLIENT_ID` for ID token verification in `modules/auth/google.py`

---

## Testing and debugging

### Health checks

```bash
curl http://localhost:8000/health/live
curl http://localhost:8000/health/ready   # checks DB + Redis
```

### Common issues

| Symptom | Likely cause |
|---------|----------------|
| 401 on dashboard API | Expired token; log in again |
| 422 validation errors | Check FastAPI `detail` in response body |
| CORS errors | Add origin to `ALLOWED_ORIGINS` or use Vite proxy |
| Email links go to localhost | Update `FRONTEND_BASE_URL` and restart backend |
| Slots empty | No availability rules or all days disabled |
| 409 on booking | Slot taken or Redis lock active |
| Migration fails on Neon | Use pooler URL; ensure network access |

### API errors in frontend

`formatApiError()` in `client.ts` parses FastAPI validation arrays into readable strings like `state: String should have at least 1 character`.

---

## Known limitations and extension points

| Area | Current state | How to extend |
|------|---------------|---------------|
| Payment providers | Paystack subaccounts + webhooks | Set `PAYSTACK_*` keys; connect bank in onboarding |
| Subscription billing | Paystack checkout (`/subscriptions/checkout`) | Falls back to simulated activate if Paystack unset |
| AI assistant | Rule-based on calendar data | Swap `ai/router.py` for OpenAI/Anthropic |
| Booking calendar | Read-only grid | Add create/reschedule endpoints + UI |
| Team members | Only `tenant_admin` used | Add invites, `tenant_user` permissions |
| Calendar sync | Not implemented | New module + OAuth for Google/Outlook |
| Tests | Minimal | Add pytest in `backend/tests/` |
| Notifications | Email only | Extend `notifications/service.py` for SMS/push |

---

## Quick reference commands

```bash
# Frontend
npm run dev
npm run build

# Backend
cd backend/app && python main.py
cd backend && .venv/bin/alembic upgrade head

# Default admin (from .env)
# /admin/login → SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD
```

---

## Getting help

- **OpenAPI**: `http://localhost:8000/docs`
- **ORM models**: `backend/app/infra/models.py`
- **All routes**: `backend/app/api/router.py` + individual `modules/*/router.py`
- **Frontend routes**: `src/app/routes.ts`
- **API surface**: `src/lib/api/client.ts`

When in doubt, trace from the UI button → `api.*` call → backend `router.py` → `models.py`.
