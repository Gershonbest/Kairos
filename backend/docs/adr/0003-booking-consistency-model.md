# ADR 0003: Booking consistency and idempotency model

## Status
Accepted

## Context
Public booking endpoints can receive concurrent requests for the same slot and duplicate retries from clients.

## Decision
- Use idempotency keys for booking creation and payment initiation.
- Use Redis-backed distributed lock on slot key (`tenant_id:service_id:start_time`) during booking creation.
- Use optimistic concurrency (`version` field) for mutable booking/payment records.
- Process webhooks and asynchronous side effects via retryable background jobs.

## Consequences
- Prevents most double-booking and duplicate side effects in high-concurrency traffic.
- Introduces lock-timeout and retry behaviors that must be monitored.
- Requires careful key design and expiration windows for idempotency records.
