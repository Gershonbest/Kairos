from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.modules.scheduling.service import generate_slots
from app.schemas.availability import CalendarBlockCreateRequest


def test_calendar_block_removes_all_slots_for_blocked_day() -> None:
    service = SimpleNamespace(
        scheduling_mode=SimpleNamespace(value="fixed"),
        duration_minutes=60,
        buffer_minutes=0,
    )
    rule = SimpleNamespace(
        day_of_week=1,
        start_time="09:00",
        end_time="12:00",
        is_enabled=True,
    )
    block = SimpleNamespace(start_date=date(2026, 8, 17), end_date=date(2026, 8, 17))
    start = datetime(2026, 8, 17, 0, 0, tzinfo=UTC)
    end = datetime(2026, 8, 17, 23, 59, tzinfo=UTC)

    open_slots = generate_slots(
        from_dt=start,
        to_dt=end,
        service=service,
        rules=[rule],
        existing_bookings=[],
    )
    blocked_slots = generate_slots(
        from_dt=start,
        to_dt=end,
        service=service,
        rules=[rule],
        existing_bookings=[],
        calendar_blocks=[block],
    )

    assert len(open_slots) == 3
    assert blocked_slots == []


def test_calendar_block_rejects_reversed_range() -> None:
    with pytest.raises(ValidationError):
        CalendarBlockCreateRequest(
            start_date=date(2026, 8, 20),
            end_date=date(2026, 8, 17),
        )
