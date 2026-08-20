"""Booking reminder scheduling, cancel, and dry-run send tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.infra.messaging import get_adapter
from app.infra.models import (
    Base,
    Booking,
    BookingStatus,
    Client,
    NotificationPreference,
    OutboundChannel,
    OutboundMessage,
    OutboundMessageStatus,
    Service,
    Tenant,
)
from app.modules.notifications.outbound import (
    compute_scheduled_for,
    deliver_planned_message,
    dispatch_outbound_message,
    enabled_reminder_channels,
    plan_reminder_jobs,
    schedule_booking_reminders,
    sync_booking_reminders,
)


def _prefs(**overrides: object) -> SimpleNamespace:
    data = {
        "client_reminder_email": True,
        "sms_enabled": False,
        "client_reminder_sms": False,
        "client_reminder_whatsapp": False,
        "client_reminder_voice": False,
        "reminder_offsets_minutes": [1440, 120],
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def test_past_due_offset_is_skipped() -> None:
    now = datetime(2026, 8, 19, 12, 0, tzinfo=UTC)
    start = now + timedelta(minutes=30)
    assert compute_scheduled_for(start, 120, now=now) is None
    assert compute_scheduled_for(start, 15, now=now) is not None


def test_no_phone_skips_sms_and_whatsapp() -> None:
    now = datetime(2026, 8, 19, 12, 0, tzinfo=UTC)
    start = now + timedelta(hours=48)
    tenant = SimpleNamespace(name="Bliss Spa", timezone="Africa/Lagos")
    booking = SimpleNamespace(
        status=BookingStatus.confirmed,
        start_at=start,
        is_all_day=False,
        guest_first_name="Ada",
        guest_last_name="Okafor",
    )
    client = SimpleNamespace(email="ada@example.com", phone=None, full_name="Ada Okafor")
    service = SimpleNamespace(name="Facial")
    prefs = _prefs(sms_enabled=True, client_reminder_sms=True, client_reminder_whatsapp=True)
    jobs = plan_reminder_jobs(
        tenant=tenant,  # type: ignore[arg-type]
        booking=booking,  # type: ignore[arg-type]
        client=client,  # type: ignore[arg-type]
        service=service,  # type: ignore[arg-type]
        prefs=prefs,  # type: ignore[arg-type]
        now=now,
    )
    channels = {job.channel for job in jobs}
    assert OutboundChannel.email in channels
    assert OutboundChannel.sms not in channels
    assert OutboundChannel.whatsapp not in channels
    keys = [(job.channel.value, job.offset_minutes) for job in jobs]
    assert len(keys) == len(set(keys))


def test_channels_use_independent_offsets() -> None:
    now = datetime(2026, 8, 19, 12, 0, tzinfo=UTC)
    start = now + timedelta(hours=48)
    tenant = SimpleNamespace(name="Bliss Spa", timezone="Africa/Lagos")
    booking = SimpleNamespace(
        status=BookingStatus.confirmed,
        start_at=start,
        is_all_day=False,
        guest_first_name="Ada",
        guest_last_name="Okafor",
    )
    client = SimpleNamespace(email="ada@example.com", phone="+2348012345678", full_name="Ada Okafor")
    service = SimpleNamespace(name="Facial")
    prefs = _prefs(
        sms_enabled=True,
        client_reminder_sms=True,
        client_reminder_whatsapp=True,
        reminder_offsets_minutes={"email": [1440], "sms": [120], "whatsapp": [60], "voice": [30]},
    )
    jobs = plan_reminder_jobs(
        tenant=tenant,  # type: ignore[arg-type]
        booking=booking,  # type: ignore[arg-type]
        client=client,  # type: ignore[arg-type]
        service=service,  # type: ignore[arg-type]
        prefs=prefs,  # type: ignore[arg-type]
        now=now,
    )
    by_channel = {job.channel: [item.offset_minutes for item in jobs if item.channel == job.channel] for job in jobs}
    assert by_channel[OutboundChannel.email] == [1440]
    assert by_channel[OutboundChannel.sms] == [120]
    assert by_channel[OutboundChannel.whatsapp] == [60]
    assert OutboundChannel.voice not in by_channel


def test_enabled_channels_require_sms_master_switch() -> None:
    assert OutboundChannel.sms not in enabled_reminder_channels(_prefs(client_reminder_sms=True))
    assert OutboundChannel.sms in enabled_reminder_channels(
        _prefs(sms_enabled=True, client_reminder_sms=True)
    )


def test_stub_sms_sends_in_dry_run(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MESSAGING_DRY_RUN", "true")
    get_settings.cache_clear()
    result = deliver_planned_message(
        channel=OutboundChannel.sms,
        to_address="+2348012345678",
        payload={"body": "Hi Ada, reminder: Facial with Bliss Spa on Friday.", "template_key": "booking_reminder"},
    )
    assert result.ok is True
    assert result.skipped is False
    assert result.provider == "stub"
    get_settings.cache_clear()


def test_voice_adapter_always_skipped() -> None:
    result = get_adapter(OutboundChannel.voice).send(
        to="+2348012345678",
        body="Reminder call",
        metadata={},
    )
    assert result.skipped is True
    assert result.skip_reason == "not_configured"


async def _session() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return factory()


async def _seed(session: AsyncSession, *, phone: str | None = "+2348012345678", hours_ahead: int = 48):
    tenant = Tenant(name="Bliss Spa", timezone="Africa/Lagos")
    session.add(tenant)
    await session.flush()
    client = Client(
        tenant_id=tenant.id,
        full_name="Ada Okafor",
        first_name="Ada",
        last_name="Okafor",
        email="ada@example.com",
        phone=phone,
    )
    service = Service(
        tenant_id=tenant.id,
        name="Facial",
        duration_minutes=60,
        price_amount=10000,
    )
    session.add_all([client, service])
    await session.flush()
    start = datetime.now(UTC) + timedelta(hours=hours_ahead)
    booking = Booking(
        tenant_id=tenant.id,
        client_id=client.id,
        service_id=service.id,
        status=BookingStatus.confirmed,
        start_at=start,
        end_at=start + timedelta(hours=1),
        idempotency_key="test-booking-1",
        guest_first_name="Ada",
        guest_last_name="Okafor",
    )
    prefs = NotificationPreference(
        tenant_id=tenant.id,
        sms_enabled=True,
        client_reminder_sms=True,
        client_reminder_whatsapp=True,
        client_reminder_email=True,
        reminder_offsets_minutes=[1440, 120],
    )
    session.add_all([booking, prefs])
    await session.flush()
    return tenant, booking, client, service


@pytest.mark.asyncio
async def test_schedule_unique_jobs_per_channel_and_offset() -> None:
    session = await _session()
    async with session:
        tenant, booking, client, service = await _seed(session)
        rows = await schedule_booking_reminders(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        again = await schedule_booking_reminders(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        all_rows = (await session.execute(select(OutboundMessage))).scalars().all()
        keys = {(row.channel.value, row.offset_minutes) for row in all_rows}
        assert len(all_rows) == len(keys)
        assert len(all_rows) == 6  # email+sms+whatsapp × 2 offsets
        assert {row.status for row in all_rows} == {OutboundMessageStatus.pending}
        assert len(rows) == 6
        assert len(again) == 6


@pytest.mark.asyncio
async def test_reschedule_replaces_pending_send_time() -> None:
    session = await _session()
    async with session:
        tenant, booking, client, service = await _seed(session)
        await schedule_booking_reminders(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        original = (await session.execute(select(OutboundMessage))).scalars().all()
        first_times = {row.id: row.scheduled_for for row in original}
        booking.start_at = booking.start_at + timedelta(hours=5)
        booking.end_at = booking.end_at + timedelta(hours=5)
        await schedule_booking_reminders(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        updated = (await session.execute(select(OutboundMessage))).scalars().all()
        assert len(updated) == len(original)
        assert any(first_times[row.id] != row.scheduled_for for row in updated)


@pytest.mark.asyncio
async def test_cancelled_booking_cancels_pending_messages() -> None:
    session = await _session()
    async with session:
        tenant, booking, client, service = await _seed(session)
        await schedule_booking_reminders(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        booking.status = BookingStatus.cancelled
        await sync_booking_reminders(session, booking)
        rows = (await session.execute(select(OutboundMessage))).scalars().all()
        assert rows
        assert all(row.status == OutboundMessageStatus.cancelled for row in rows)


@pytest.mark.asyncio
async def test_poller_marks_stub_sms_sent_when_dry_run(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MESSAGING_DRY_RUN", "true")
    get_settings.cache_clear()
    session = await _session()
    async with session:
        tenant, booking, client, service = await _seed(session, hours_ahead=48)
        await schedule_booking_reminders(
            session, tenant=tenant, booking=booking, client=client, service=service
        )
        message = (
            await session.execute(select(OutboundMessage).where(OutboundMessage.channel == OutboundChannel.sms))
        ).scalars().first()
        assert message is not None
        message.scheduled_for = datetime.now(UTC) - timedelta(minutes=1)
        message.status = OutboundMessageStatus.sending
        await dispatch_outbound_message(session, message)
        assert message.status == OutboundMessageStatus.sent
        assert message.provider == "stub"
    get_settings.cache_clear()
