"""Subscription status payload — suspension must override paid access."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.modules.subscriptions.service import subscription_status_payload


def _tenant(**overrides):
    now = datetime.now(UTC)
    base = {
        "status": "active",
        "plan_code": "premium",
        "subscription_paid_until": now + timedelta(days=20),
        "trial_ends_at": now - timedelta(days=5),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_suspended_overrides_active_paid_period():
    payload = subscription_status_payload(_tenant(status="suspended"))
    assert payload["status"] == "suspended"
    assert payload["warning_level"] == "suspended"
    assert payload["requires_plan_selection"] is True


def test_active_paid_period_when_not_suspended():
    payload = subscription_status_payload(_tenant(status="active"))
    assert payload["status"] == "active"
    assert payload["requires_plan_selection"] is False


def test_inactive_overrides_active_paid_period():
    payload = subscription_status_payload(_tenant(status="inactive"))
    assert payload["status"] == "inactive"
    assert payload["requires_plan_selection"] is True
