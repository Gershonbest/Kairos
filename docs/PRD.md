# Product Requirements Document

# Orheo Bookings — AI-Powered Booking CRM

| Field | Value |
| --- | --- |
| **Product** | Orheo Bookings |
| **Category** | AI-powered booking CRM (SaaS) |
| **Primary market** | Service businesses across Africa |
| **Status** | Live product (iterating) |
| **Document version** | 2.0 |
| **Last updated** | 2026-08-26 |

---

## 1. Executive summary

**Orheo Bookings** is a multi-tenant SaaS platform that helps service businesses schedule appointments, collect payments, manage clients, and communicate automatically — with an AI assistant (**Orion**) that can configure the business and book on behalf of clients.

**Brand:** *Create Order. Unlock Flow.*  
**Hero promise:** *Grow Your Service Business with Smart Bookings*  
**Positioning:** *Orheo automates scheduling, payments, and customer communication so you can focus on delivering exceptional service across Africa.*  
**Built for:** consultants, clinics, coaches, salons, beauty bars, and other service professionals.

Each tenant gets:

1. A branded **public booking page** (and optional AI chat for clients).
2. A **dashboard CRM** for calendar, services, products, clients, payments, team, and settings.
3. **Orion** — plan-gated AI for onboarding, operations, and public booking.
4. **Paystack** payment collection (booking deposits + Orheo subscriptions).
5. **Reminders** across email (and SMS / WhatsApp / voice by plan).

---

## 2. Problem and opportunity

### 2.1 Problem

African service businesses often run on WhatsApp chats, paper diaries, and fragmented payment apps. That leads to:

- Double-bookings and no-shows with weak reminder coverage.
- No single client history (CRM) tied to appointments and balances.
- Manual payment chasing after deposits.
- Solo owners who cannot add a second practitioner when demand grows.
- Tools built for US/EU markets that ignore local banks, USSD, and mobile money.

### 2.2 Opportunity

Provide one Africa-first system of record: **book → pay → remind → serve → retain**, with AI reducing setup time and front-desk load.

### 2.3 Product principles

| Principle | Meaning |
| --- | --- |
| Tenant isolation | Every business's data is scoped; never leak across tenants |
| Pay local | Paystack channels (card, bank, USSD, transfer, QR) |
| AI as co-pilot | Orion helps configure and book; humans stay in control on mutating ops |
| Sell what we ship | Plan seats and Orion are enforced; catalog claims must match product |
| Mobile-first public page | Clients book on phones; owners run ops from the dashboard |

---

## 3. Goals and non-goals

### 3.1 Goals

1. Let a business go from signup → public booking link in under a day (trial, no card required).
2. Capture appointments with correct assignee, payment state, and client record.
3. Collect deposits via Paystack and track remaining balances.
4. Reduce no-shows with timed reminders (email always; SMS/WhatsApp/voice by plan).
5. Scale from solo (Standard) to multi-staff (Premium/Enterprise) with roles and parallel calendars.
6. Use Orion to onboard, answer FAQs from knowledge, and book publicly where allowed by plan.
7. Give Orheo platform admins visibility into subscribers and payment health.

### 3.2 Non-goals (current horizon)

| Item | Notes |
| --- | --- |
| Full Google / Apple / Outlook calendar sync | Marketing may mention sync; product sync is not v1 |
| Ownership transfer between users | Owner remains signup `tenant_admin` |
| Commission / payroll / clock-in | Out of scope |
| Non-Paystack PSPs | Paystack-first |
| Enforcing Standard's 150 bookings/month hard cap | Catalog limit; enforcement deferred |
| Fully productized white-label / multi-location ops | Entitlements exist; deep UX later |
| Voice AI call reminders | Enterprise feature flag; adapter still stubbed |

---

## 4. Personas and roles

### 4.1 Personas

| Persona | Needs |
| --- | --- |
| **Solo owner** | Fast setup, public link, deposits, email reminders |
| **Growing salon / clinic owner** | Team seats, parallel booking, role-based access |
| **Front desk** | Book/reassign anyone, manage clients, no billing |
| **Practitioner (staff)** | Own calendar, own hours, assigned clients only |
| **Client** | Book on phone, pick person, pay deposit, get confirmation |
| **Platform operator** | Suspend tenants, grant plans, inspect payment logs |

### 4.2 System roles

| Role | Storage | Access |
| --- | --- | --- |
| **Owner** | `tenant_admin` | Full tenant: Team, billing, Paystack, danger zone, all calendars |
| **Manager** | `tenant_user` + `staff_role=manager` | Operations: calendars, catalogue, clients, business hours — no billing/Team |
| **Staff** | `tenant_user` + `staff` | Own calendar/hours, assigned bookings & clients |
| **Front desk** | `tenant_user` + `front_desk` | Book/reassign anyone, clients; optional bookable |
| **Platform admin** | `platform_admin` | `/admin` only |
| **Client** | Public guest + `clients` row | Public booking + CRM profile |

Named permissions (`calendar:all`, `payments:manage`, `team:manage`, …) are returned on `GET /auth/me` and enforced on the API; the UI hides unauthorized nav.

---

## 5. Market and packaging

### 5.1 Pricing (NGN / month)

| Plan | Price | Positioning |
| --- | --- | --- |
| **Standard** | ₦10,000 | Solo practitioners getting started |
| **Premium** (featured) | ₦25,000 | Growing businesses + AI |
| **Enterprise** | Contact Admin | Custom and white-label |

**Trial:** 7 days free, no credit card. Trial starts on Standard entitlements until paid.

### 5.2 Entitlements (catalog)

| Capability | Standard | Premium | Enterprise |
| --- | --- | --- | --- |
| Bookings / month | Up to 150 (catalog) | Unlimited | Unlimited |
| Team seats (incl. owner) | 1 | 5 | Unlimited |
| Public booking page | ✓ | ✓ | ✓ |
| Client database | ✓ | ✓ | ✓ |
| Payment processing | ✓ | ✓ | ✓ |
| Email notifications / reminders | ✓ | ✓ | ✓ |
| Orion AI assistant | ✗ | ✓ | ✓ |
| Custom branding | ✓ | ✓ | ✓ |
| Analytics dashboard | ✓ | ✓ | ✓ |
| SMS reminders | ✗ | ✓ | ✓ |
| WhatsApp reminders | ✗ | ✓ | ✓ |
| Multi-location | ✗ | ✓ | ✓ |
| White-label | ✗ | ✗ | ✓ |
| Voice / AI call reminders | ✗ | ✗ | ✓ |
| Self-serve checkout | ✓ | ✓ | ✗ (contact sales) |

**Enforced today:** team seats, Orion plan gate (402 upgrade), reminder channel plan flags, subscription access for dashboard.  
**Catalog-ahead:** multi-location, white-label, voice delivery, hard booking-count caps.  
**Admin:** platform admins edit prices and entitlement ticks at `/admin/plans`. Saved values are the live catalog for checkout, landing, and plan gates.

---

## 6. Product architecture (logical)

```text
┌──────────────┐     ┌────────────────────┐     ┌─────────────────┐
│ Marketing /  │     │ Tenant dashboard   │     │ Public booking  │
│ Landing      │     │ CRM + Orion        │     │ + public Orion  │
└──────┬───────┘     └─────────┬──────────┘     └────────┬────────┘
       │                       │                         │
       └───────────────────────┼─────────────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ FastAPI /api/v1     │
                    │ Auth · Bookings ·   │
                    │ Clients · Payments  │
                    │ Team · AI · Public  │
                    └─────────┬───────────┘
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
      PostgreSQL           Redis            Paystack /
      (tenant rows)     (slot locks)        Brevo / Termii
```

---

## 7. Core domains and requirements

### 7.1 Authentication and session

| ID | Requirement |
| --- | --- |
| AUTH-1 | Email/password signup and login with JWT access + refresh tokens. |
| AUTH-2 | Email verification required before full access (configurable). |
| AUTH-3 | Password reset via email; Google-only accounts get a "sign in with Google" hint. |
| AUTH-4 | Google Sign-In via ID token; attaches to existing user by email when present. |
| AUTH-5 | Team invite accept at `/invite/:token` creates `tenant_user`, verifies email, issues tokens. |
| AUTH-6 | Platform admin uses a separate login and role; cannot use tenant dashboard. |
| AUTH-7 | `GET /auth/me` returns profile, `is_owner`, `staff_role`, `permissions[]`, subscription status. |

### 7.2 Onboarding and trial

| ID | Requirement |
| --- | --- |
| ONB-1 | New tenants start a **7-day trial** without payment. |
| ONB-2 | Setup can be completed via Settings and/or **Orion Onboarding** (profile, services, hours, Paystack). |
| ONB-3 | Expired / suspended tenants are directed to Choose Plan; limited access until paid. |
| ONB-4 | Trial banner and plan selection are visible in the dashboard shell. |

### 7.3 Public booking experience

Route: `/book/:businessId` (UUID or `public_slug`).

| ID | Requirement |
| --- | --- |
| PUB-1 | Multi-step flow: Service → (Product) → (Who you'll see) → Date & Time → Details → Payment → Confirmation. |
| PUB-2 | Support general services and **product/listing-based** services. |
| PUB-3 | Support online / onsite / hybrid appointment formats. |
| PUB-4 | If ≥2 bookable staff on a service, show **Anyone** vs named people; one person skips the picker. |
| PUB-5 | Slots respect assignee hours, buffers, calendar blocks, and conflicts. |
| PUB-6 | Redis short-lived locks prevent double-booking races. |
| PUB-7 | Confirmation shows service, time, location/format, and **You'll meet** (assignment snapshot). |
| PUB-8 | Optional embedded **public Orion** chat for browse/book/cancel/reschedule. |
| PUB-9 | Works when payments are disabled (demo / free confirm path). |

### 7.4 Calendar and appointments

| ID | Requirement |
| --- | --- |
| CAL-1 | Month / week / day views of bookings and blocks. |
| CAL-2 | Manual booking with required assignee (staff who can deliver the service). |
| CAL-3 | Staff filter: All / Me / person; Staff role defaults to Me. |
| CAL-4 | Reassign bookings (Owner / Manager / Front desk). |
| CAL-5 | Color-by-assignee for parallel staffing. |
| CAL-6 | Outcomes: completed, no-show, cancelled, re-confirmed — scoped by visibility. |
| CAL-7 | Calendar blocks (time off / closed days) remove public slots. |
| CAL-8 | Two staff may share the same start time; the same staff may not overlap (incl. buffer). |

### 7.5 Services and products (catalogue)

| ID | Requirement |
| --- | --- |
| CAT-1 | Services: name, description, duration, price, deposit, buffer, image, active flag. |
| CAT-2 | Scheduling modes: fixed slots, flexible, all-day. |
| CAT-3 | Booking type: **general** or **listing** (requires linked products). |
| CAT-4 | Appointment type: online / onsite / hybrid (+ meeting link / location rules). |
| CAT-5 | Assign **bookable team members** per service (`service_staff`). |
| CAT-6 | Products/listings: name, images, status (available / reserved / sold / hidden), service links. |

### 7.6 Availability

| ID | Requirement |
| --- | --- |
| AVL-1 | Tenant **business hours** (weekly rules) editable by Owner/Manager. |
| AVL-2 | Per-user **My hours**; if empty, inherit business hours. |
| AVL-3 | Changes apply immediately to public slot generation. |

### 7.7 Clients (CRM)

| ID | Requirement |
| --- | --- |
| CRM-1 | Client profiles: name, email, phone, notes; unique email per tenant. |
| CRM-2 | Aggregate bookings, spend, last visit. |
| CRM-3 | Client detail: history, communications, email templates, log outreach. |
| CRM-4 | Staff with `clients:assigned` only see clients tied to their bookings. |
| CRM-5 | Public booking upserts client by email and stores guest name aliases on the booking. |

### 7.8 Team members (Premium+)

| ID | Requirement |
| --- | --- |
| TEAM-1 | Seat limits: Standard 1, Premium 5 (incl. owner), Enterprise unlimited. |
| TEAM-2 | Count **active users + pending invites**; over cap → **402**. |
| TEAM-3 | Invite by email (7-day token); resend / revoke; deactivate revokes sessions. |
| TEAM-4 | Roles: Manager, Staff, Front desk — named, not a custom ACL UI. |
| TEAM-5 | Team page and invite UI are owner-only (`team:manage`). |
| TEAM-6 | Invite links built at send time from `FRONTEND_BASE_URL`. |

See §10 for the detailed permission matrix.

### 7.9 Payments and balances

Two money streams:

1. **Client → business** (booking deposit / charge) via Paystack **subaccount** + platform fee (default 5%).
2. **Business → Orheo** (subscription) — 100% to platform.

| ID | Requirement |
| --- | --- |
| PAY-1 | Connect settlement bank account; create Paystack subaccount (no tenant secret keys stored). |
| PAY-2 | Charge deposit or full price on public/manual booking when payments enabled. |
| PAY-3 | Webhook `charge.success` confirms payment; support Paystack redirect return. |
| PAY-4 | Ledger purposes: booking / deposit / balance; support record or waive balance (cash, transfer, POS, other). |
| PAY-5 | Currency **NGN** (kobo at gateway). |
| PAY-6 | Channels: card, bank (incl. OPay), USSD, bank_transfer, QR (configurable). |
| PAY-7 | Demo / dry behavior when Paystack is not configured. |
| PAY-8 | Payments dashboard and Settings → Payments require `payments:manage`. |

### 7.10 Subscriptions and billing

| ID | Requirement |
| --- | --- |
| SUB-1 | Self-serve upgrade Standard ↔ Premium via Paystack. |
| SUB-2 | Enterprise is sales-led (contact path). |
| SUB-3 | `paid_until` / status drive dashboard access after trial. |
| SUB-4 | Subscription payment receipts emailed to owner. |
| SUB-5 | Settings → Billing shows plan and status (owner only). |

### 7.11 Notifications and reminders

| ID | Requirement |
| --- | --- |
| NOT-1 | Transactional email: verify, reset, invite, booking confirmation, receipt, ICS, subscription receipt. |
| NOT-2 | In-app notifications for new bookings → **assignee + owner + managers**. |
| NOT-3 | Client reminders via durable outbound jobs; default offsets **24h and 2h** before start. |
| NOT-4 | Channels: email (all plans); SMS + WhatsApp (Premium+); voice (Enterprise flag / stub). |
| NOT-5 | Tenant Settings → Notifications: toggles and per-channel offsets. |
| NOT-6 | Messaging providers: Brevo and/or Termii; dry-run mode for local/dev. |

### 7.12 Orion (AI assistant)

Agents:

| Audience | Agent | Purpose |
| --- | --- | --- |
| Dashboard | Business | Ops Q&A and actions |
| Dashboard | Onboarding | Configure profile, services, hours |
| Public | Public booking | Help clients browse and book |

| ID | Requirement |
| --- | --- |
| AI-1 | Gated by plan feature `ai_assistant` (Premium+); otherwise 402 / upgrade UX. |
| AI-2 | Tools: knowledge search, services, hours, profile, availability (± assignee), create/cancel/reschedule booking, FAQs, reindex. |
| AI-3 | **Must not** invite or manage team / billing. |
| AI-4 | Knowledge base: uploaded docs, FAQs, policies; vector search (pgvector). |
| AI-5 | Streaming chat (`/ai/chat/stream`); HITL approval for mutating internal tools. |
| AI-6 | Optional `assigned_user_id` on availability/create; omit → Anyone logic. |
| AI-7 | Floating Orion widget in dashboard; full page at `/dashboard/orion`. |

### 7.13 Branding and public presence

| ID | Requirement |
| --- | --- |
| BR-1 | Business name, type, timezone, phone, address / branches fields. |
| BR-2 | Public logo, tagline, description, cancellation & booking policies. |
| BR-3 | Public slug for shareable booking URLs. |
| BR-4 | Booking Links page lists URLs from `PUBLIC_BOOKING_BASE_URL`. |
| BR-5 | Custom branding entitlement on Premium+ (logo / public page personalization). |

### 7.14 Platform admin

Routes under `/admin`.

| ID | Requirement |
| --- | --- |
| ADM-1 | Metrics overview. |
| ADM-2 | List / patch subscribers (plan, suspend). |
| ADM-3 | Delete tenant with cascade (including team invites, staff hours, service_staff). |
| ADM-4 | Payment logs and summaries. |
| ADM-5 | Plan catalog visibility for ops. |

### 7.15 Dashboard home and analytics

| ID | Requirement |
| --- | --- |
| HOM-1 | Today's appointments, KPIs (bookings, revenue signals), upcoming list. |
| HOM-2 | Premium+ analytics dashboard entitlement (charts / insights as implemented). |
| HOM-3 | Command palette for quick navigation (permission-filtered). |

---

## 8. End-to-end journeys

### 8.1 Owner activation

```text
Land → Start trial → Signup / Google → Verify email
    → Dashboard (trial banner)
    → Orion onboarding or Settings: profile, services, hours
    → Connect Paystack settlement account
    → Share /book/{slug|id} (Booking Links / QR)
```

### 8.2 Client books and pays

```text
Open public page → Service [(product)] [(staff)] → Slot → Details
    → Paystack checkout (if required) → Webhook confirms
    → Email confirmation + ICS
    → Reminders at configured offsets
```

### 8.3 Multi-staff day

```text
Owner invites stylist → Accept invite → Assign to services
    → Client picks Anyone or named staff
    → Two staff confirmed at 10:00 OK
    → Same staff double-book rejected
    → Front desk reassigns from calendar
```

### 8.4 Balance collection

```text
Deposit paid online → Appointment completed
    → Record remaining balance (cash/transfer/POS) or waive
    → Payments dashboard reflects ledger
```

### 8.5 Upgrade

```text
Trial ends or Standard hits seat wall → Choose Plan
    → Paystack subscription → paid_until extended
    → Orion / seats unlock per plan
```

---

## 9. Information architecture (routes)

| Area | Paths |
| --- | --- |
| Marketing | `/` |
| Auth | `/auth/login`, `/auth/signup`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password` |
| Invite | `/invite/:token` |
| Dashboard | `/dashboard`, `/calendar`, `/availability`, `/services`, `/products`, `/clients`, `/payments`, `/booking-links`, `/settings`, `/team`, `/orion`, `/choose-plan` |
| Public | `/book/:businessId` |
| Admin | `/admin`, `/admin/login`, subscribers, payment logs |

---

## 10. Team permission matrix

| Surface | Owner | Manager | Front desk | Staff |
| --- | --- | --- | --- | --- |
| Own calendar / assigned bookings | ✓ | ✓ | ✓ | ✓ |
| All calendars / reassign | ✓ | ✓ | ✓ | ✗ |
| Clients (full) | ✓ | ✓ | ✓ | ✗ |
| Clients (assigned only) | — | — | — | ✓ |
| Services / products | ✓ | ✓ | ✗ | ✗ |
| Business hours | ✓ | ✓ | ✗ | ✗ |
| Own hours | ✓ | ✓ | ✓ | ✓ |
| Payments / Paystack / plan | ✓ | ✗ | ✗ | ✗ |
| Team invite | ✓ | ✗ | ✗ | ✗ |
| Danger zone | ✓ | ✗ | ✗ | ✗ |
| Orion | Plan-gated | Plan-gated | Plan-gated | Plan-gated |

---

## 11. Data concepts (product-level)

| Concept | Description |
| --- | --- |
| **Tenant** | One business account; all data scoped by `tenant_id` |
| **User** | Owner or invited team member |
| **Service** | Bookable offering (duration, price, deposit, staff) |
| **Listing / product** | Inventory unit for product-based booking |
| **Client** | CRM person record |
| **Booking** | Appointment with assignee snapshots, status, payment state |
| **Availability rule** | Weekly open windows (tenant or per staff) |
| **Calendar block** | Closed dates / time off |
| **Payment transaction** | Paystack or recorded balance entry |
| **Team invite** | Pending seat + token |
| **Knowledge doc / FAQ** | Orion RAG corpus |
| **Outbound message** | Scheduled reminder job |

Booking uniqueness (general): per **assignee + start**, not per whole service — enabling parallel staff.

---

## 12. Integrations and environments

| Integration | Use |
| --- | --- |
| **Paystack** | Booking charges, subscription checkout, webhooks |
| **Brevo** | Email (+ optional SMS/WhatsApp) |
| **Termii** | SMS/WhatsApp (NG-focused alternative) |
| **OpenAI** | Orion LLM + embeddings |
| **PostgreSQL + pgvector** | Primary data + knowledge search |
| **Redis** | Slot locks, outbound job lock, cache |
| **S3** | Media uploads in production |

**Critical env for links:** `FRONTEND_BASE_URL`, `PUBLIC_BOOKING_BASE_URL`, Paystack callback URLs — must match the live frontend host (never ship stale tunnel URLs).

---

## 13. Success metrics

| Metric | Why it matters |
| --- | --- |
| Trial → paid conversion | Monetization |
| Tenants with ≥1 public booking / week | Activation |
| Deposit collection rate | Payment product health |
| Reminder send success / no-show rate | Communication value |
| Premium tenants with ≥2 seats | Team feature adoption |
| Orion sessions with successful tool use | AI value |
| Time-to-first-booking-link | Onboarding quality |
| Support tickets (double-book, Paystack, invites) | Quality bar |

---

## 14. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Catalog claims ahead of enforcement | Document deferred items; enforce seats & Orion first |
| Stale public URLs in emails | Resolve from env at send time; restart after env change |
| AI hallucinations / bad mutations | HITL for internal mutating tools; public tools limited |
| Payment webhook gaps | Redirect confirm + webhook; idempotent booking keys |
| Seat gaming via pending invites | Pending counts toward seat cap |
| Staff over-restriction | Front desk + Manager cover ops without billing access |

---

## 15. Roadmap themes (post-v1)

1. **Calendar sync** — Google / Apple / Outlook per business and per staff.
2. **Hard booking quotas** on Standard.
3. **Multi-location** — branches with staff and hours.
4. **White-label** — custom domains / deeper branding.
5. **API access** — partner integrations (Enterprise).
6. **Voice reminders** — production voice or call agent.
7. **Ownership transfer**, SMS invites, commission.
8. **Richer CRM** — pipelines, segments, campaigns beyond templates.

---

## 16. Acceptance criteria (product-level)

A release is "complete" for the core loop when:

- [ ] Solo owner can trial, publish a booking page, take a deposit (or demo confirm), and receive confirmation email.
- [ ] Availability, buffers, and blocks correctly shape slots.
- [ ] Clients CRM updates from public bookings; dashboard can create clients and manual bookings.
- [ ] Premium unlocks Orion and up to 5 seats; Standard cannot invite.
- [ ] Parallel staff booking works; same-staff overlap fails.
- [ ] Public Anyone / named staff works when 2+ people are on a service.
- [ ] Reminders enqueue for entitled channels; Settings controls offsets.
- [ ] Subscription checkout extends access after trial.
- [ ] Platform admin can suspend and delete a tenant safely.
- [ ] Permissions hide billing from non-owners; API still 403s.

---

## 17. Glossary

| Term | Meaning |
| --- | --- |
| **Tenant** | One business on Orheo |
| **Orion** | Orheo's AI assistant |
| **Assignee** | Team member responsible for a booking |
| **Anyone** | Auto-pick first free bookable staff at a slot |
| **Listing** | Product / inventory unit for product-based services |
| **Seat** | Active user or pending invite counting against plan |
| **Balance** | Remaining amount after deposit |
| **Subaccount** | Paystack split destination for the business |

---

## 18. Related documents

| Doc | Purpose |
| --- | --- |
| [`docs/DEVELOPERS.md`](DEVELOPERS.md) | Engineering setup and conventions |
| [`docs/PAYMENTS.md`](PAYMENTS.md) | Paystack flows and webhooks |
| `backend/docs/adr/*` | Tenancy, auth, booking consistency ADRs |

---

## 19. Document history

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-08-26 | Team Members & Appointment Assignment only |
| 2.0 | 2026-08-26 | Full-product PRD: AI-powered booking CRM |
