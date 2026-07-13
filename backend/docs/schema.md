# Database schema notes

## Core tables
- `tenants`: tenant/business accounts
- `users`: tenant and platform users with role enum
- `refresh_tokens`: persisted rotation records
- `services`: tenant offerings
- `availability_rules`: weekly recurring availability
- `clients`: tenant customers
- `bookings`: slot-reserved appointments with idempotency and optimistic version
- `payment_transactions`: payment lifecycle records with idempotency
- `webhook_events`: retryable incoming provider events
- `subscription_plans`: plan catalog and entitlements

## Multi-tenant guardrails
- `tenant_id` is required on all tenant-owned tables.
- Uniqueness constraints include tenant scope where relevant.
- Booking and payment uniqueness includes idempotency keys.
