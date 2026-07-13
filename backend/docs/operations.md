# Operations runbook (v1)

## SLOs
- Public booking create p95 < 400ms (excluding payment provider round-trip)
- Availability lookup p95 < 250ms
- Webhook processing success > 99%
- Notification queue retry drain < 10 minutes

## Alerts
- 5xx rate > 2% for 5 minutes
- `/health/ready` failures for 2 minutes
- Webhook backlog > 100 unprocessed events
- Payment intent failures spikes > 10/min

## Backups and restore
- Daily RDS snapshots with 14-day retention.
- Weekly restore drill into staging environment.
- Migration rollback verified in staging before production release.
