"""Dashboard summary revenue should exclude subscription fees."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.infra.models import PaymentStatus
from app.modules.dashboard import router as dashboard_router


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


@pytest.mark.asyncio
async def test_monthly_revenue_excludes_subscription_payments() -> None:
    now = datetime(2026, 8, 5, 12, 0, tzinfo=UTC)
    booking_tx = SimpleNamespace(
        status=PaymentStatus.succeeded,
        purpose="booking",
        amount=2500,
        paid_at=now,
        created_at=now,
    )
    subscription_tx = SimpleNamespace(
        status=PaymentStatus.succeeded,
        purpose="subscription",
        amount=10000,
        paid_at=now,
        created_at=now,
    )

    session = AsyncMock()
    # bookings, clients, transactions, upcoming
    session.execute = AsyncMock(
        side_effect=[
            _Result([]),
            _Result([]),
            _Result([booking_tx, subscription_tx]),
            _Result([]),
        ]
    )

    current_user = SimpleNamespace(tenant_id="tenant-1")
    cache = MagicMock()
    cache.tenant_key = MagicMock(return_value="k")
    cache.get_json = AsyncMock(return_value=None)
    cache.set_json = AsyncMock()

    with (
        patch.object(dashboard_router, "redis_cache", cache),
        patch.object(dashboard_router, "utc_now", return_value=now),
    ):
        payload = await dashboard_router.get_dashboard_summary(current_user, session)

    assert payload["stats"]["monthly_revenue"] == 2500.0
    assert payload["revenue_series"][-1]["revenue"] == 2500.0
