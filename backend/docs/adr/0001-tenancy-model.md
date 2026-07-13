# ADR 0001: Multi-tenant isolation model

## Status
Accepted

## Context
Kairos Bookings serves many businesses in a single platform while handling sensitive client and payment data.

## Decision
- Use a shared PostgreSQL database with tenant-scoped tables.
- Every tenant-owned record includes `tenant_id`.
- Enforce isolation in repository/service queries (never optional for tenant-owned entities).
- Add application-level policy tests that prove cross-tenant reads/writes are rejected.

## Consequences
- Fast onboarding and low operational complexity for v1.
- Strong developer discipline required to avoid missing tenant filters.
- Easy to evolve toward schema-per-tenant or service extraction if needed later.
