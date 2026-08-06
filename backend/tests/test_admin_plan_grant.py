"""Admin complimentary plan grants activate paid access without payment."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.modules.subscriptions.service import grant_plan_to_tenant


def _tenant(**overrides):
    now = datetime.now(UTC)
    base = {
        "status": "trial",
        "plan_code": "standard",
        "subscription_paid_until": None,
        "trial_ends_at": now + timedelta(days=7),
        "trial_warning_sent_at": now,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_grant_plan_activates_trial_tenant():
    tenant = _tenant()
    plan = SimpleNamespace(code="premium", is_active=True)
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = plan
    session.execute.return_value = result

    now = datetime.now(UTC)
    with patch("app.modules.subscriptions.service.select"):
        grant = await grant_plan_to_tenant(session, tenant, "premium", days=30, now=now)

    assert tenant.status == "active"
    assert tenant.plan_code == "premium"
    assert tenant.subscription_paid_until == now + timedelta(days=30)
    assert tenant.trial_warning_sent_at is None
    assert grant["subscription"]["status"] == "active"
    assert grant["subscription"]["is_trial"] is False
    assert grant["subscription"]["requires_plan_selection"] is False


@pytest.mark.asyncio
async def test_grant_plan_extends_existing_paid_period():
    now = datetime.now(UTC)
    existing = now + timedelta(days=10)
    tenant = _tenant(status="active", plan_code="standard", subscription_paid_until=existing)
    plan = SimpleNamespace(code="premium", is_active=True)
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = plan
    session.execute.return_value = result

    with patch("app.modules.subscriptions.service.select"):
        await grant_plan_to_tenant(session, tenant, "premium", days=30, now=now)

    assert tenant.subscription_paid_until == existing + timedelta(days=30)


@pytest.mark.asyncio
async def test_grant_plan_rejects_inactive_tenant():
    tenant = _tenant(status="inactive")
    session = AsyncMock()
    with pytest.raises(ValueError, match="deactivated"):
        await grant_plan_to_tenant(session, tenant, "premium")
