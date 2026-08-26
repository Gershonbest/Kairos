"""Schedule, cancel, and dispatch durable booking reminder messages."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.plans import PlanFeature, hydrate_runtime_catalog, plan_has_feature
from app.infra.cache import redis_cache
from app.infra.db import SessionLocal
from app.infra.messaging import ProviderResult, get_adapter
from app.infra.models import (
    Booking,
    BookingStatus,
    Client,
    NotificationPreference,
    OutboundChannel,
    OutboundMessage,
    OutboundMessageStatus,
    OutboundPurpose,
    Service,
    Tenant,
)
from app.modules.clients.names import visit_display_name

logger = structlog.get_logger()

DEFAULT_REMINDER_OFFSETS = [1440, 120]
DEFAULT_CHANNEL_OFFSETS = {
    "email": list(DEFAULT_REMINDER_OFFSETS),
    "sms": list(DEFAULT_REMINDER_OFFSETS),
    "whatsapp": list(DEFAULT_REMINDER_OFFSETS),
    "voice": list(DEFAULT_REMINDER_OFFSETS),
}
MAX_SEND_ATTEMPTS = 5
LOCK_KEY = "jobs:outbound-messages"
TEMPLATE_KEY = "booking_reminder"
TEMPLATE_KEY_CONFIRMATION = "booking_confirmation"
CHANNEL_OFFSET_KEYS = ("email", "sms", "whatsapp", "voice")


def clean_offsets(raw: object) -> list[int]:
    if not isinstance(raw, list):
        return []
    offsets: list[int] = []
    seen: set[int] = set()
    for value in raw:
        try:
            minutes = int(value)
        except (TypeError, ValueError):
            continue
        if minutes <= 0 or minutes in seen:
            continue
        seen.add(minutes)
        offsets.append(minutes)
    return offsets


def normalize_channel_offsets(raw: object) -> dict[str, list[int]]:
    if isinstance(raw, list):
        shared = clean_offsets(raw) or list(DEFAULT_REMINDER_OFFSETS)
        return {key: list(shared) for key in CHANNEL_OFFSET_KEYS}
    if not isinstance(raw, dict):
        return {key: list(values) for key, values in DEFAULT_CHANNEL_OFFSETS.items()}
    normalized: dict[str, list[int]] = {}
    for key in CHANNEL_OFFSET_KEYS:
        if key not in raw or raw.get(key) is None:
            normalized[key] = list(DEFAULT_REMINDER_OFFSETS)
        else:
            normalized[key] = clean_offsets(raw.get(key))
    return normalized


def reminder_offsets(prefs: NotificationPreference | None, channel: OutboundChannel) -> list[int]:
    mapping = normalize_channel_offsets(getattr(prefs, "reminder_offsets_minutes", None) if prefs else None)
    return list(mapping.get(channel.value, list(DEFAULT_REMINDER_OFFSETS)))


@dataclass(frozen=True)
class ReminderPlan:
    channel: OutboundChannel
    offset_minutes: int
    scheduled_for: datetime
    to_address: str
    payload: dict


def _channel_allowed_by_plan(tenant: Tenant | None, channel: OutboundChannel) -> bool:
    if tenant is None or not getattr(tenant, "plan_code", None):
        return True
    feature_map = {
        OutboundChannel.email: PlanFeature.client_reminders_email,
        OutboundChannel.sms: PlanFeature.client_reminders_sms,
        OutboundChannel.whatsapp: PlanFeature.client_reminders_whatsapp,
        OutboundChannel.voice: PlanFeature.client_reminders_voice,
    }
    feature = feature_map[channel]
    try:
        return plan_has_feature(tenant.plan_code, feature)
    except Exception:
        return True


def enabled_reminder_channels(
    prefs: NotificationPreference | None,
    *,
    tenant: Tenant | None = None,
) -> list[OutboundChannel]:
    channels: list[OutboundChannel] = []
    if (
        (prefs is None or getattr(prefs, "client_reminder_email", True))
        and _channel_allowed_by_plan(tenant, OutboundChannel.email)
    ):
        channels.append(OutboundChannel.email)
    sms_on = bool(getattr(prefs, "sms_enabled", False) and getattr(prefs, "client_reminder_sms", False))
    if sms_on and _channel_allowed_by_plan(tenant, OutboundChannel.sms):
        channels.append(OutboundChannel.sms)
    if (
        prefs is not None
        and getattr(prefs, "client_reminder_whatsapp", False)
        and _channel_allowed_by_plan(tenant, OutboundChannel.whatsapp)
    ):
        channels.append(OutboundChannel.whatsapp)
    if (
        prefs is not None
        and getattr(prefs, "client_reminder_voice", False)
        and _channel_allowed_by_plan(tenant, OutboundChannel.voice)
    ):
        channels.append(OutboundChannel.voice)
    return channels


def destination_for(channel: OutboundChannel, client: Client) -> str | None:
    if channel == OutboundChannel.email:
        email = (client.email or "").strip()
        return email or None
    phone = (client.phone or "").strip()
    return phone or None


def compute_scheduled_for(
    start_at: datetime,
    offset_minutes: int,
    *,
    now: datetime,
) -> datetime | None:
    start = start_at if start_at.tzinfo else start_at.replace(tzinfo=UTC)
    due = start - timedelta(minutes=offset_minutes)
    if due <= now:
        return None
    return due


def format_local_when(start_at: datetime, timezone_name: str, *, is_all_day: bool = False) -> str:
    try:
        zone = ZoneInfo(timezone_name or "Africa/Lagos")
    except Exception:
        zone = ZoneInfo("Africa/Lagos")
    local = (start_at if start_at.tzinfo else start_at.replace(tzinfo=UTC)).astimezone(zone)
    if is_all_day:
        return local.strftime("%A, %B %d, %Y (all day)")
    return local.strftime("%A, %B %d, %Y at %I:%M %p").replace(" 0", " ")


def build_reminder_body(
    *,
    client_name: str,
    service_name: str,
    business_name: str,
    when_label: str,
) -> str:
    return (
        f"Hi {client_name}, reminder: {service_name} with {business_name} on {when_label}. "
        "Reply if you need to reschedule."
    )


def plan_reminder_jobs(
    *,
    tenant: Tenant,
    booking: Booking,
    client: Client,
    service: Service,
    prefs: NotificationPreference | None,
    now: datetime | None = None,
) -> list[ReminderPlan]:
    moment = now or datetime.now(UTC)
    if booking.status != BookingStatus.confirmed:
        return []
    when_label = format_local_when(
        booking.start_at,
        tenant.timezone or "Africa/Lagos",
        is_all_day=bool(booking.is_all_day),
    )
    client_name = visit_display_name(booking, client)
    body = build_reminder_body(
        client_name=client_name,
        service_name=service.name,
        business_name=tenant.name,
        when_label=when_label,
    )
    subject = f"Reminder: {service.name} with {tenant.name}"
    jobs: list[ReminderPlan] = []
    seen: set[tuple[str, int]] = set()
    for channel in enabled_reminder_channels(prefs, tenant=tenant):
        to_address = destination_for(channel, client)
        if not to_address:
            continue
        for offset in reminder_offsets(prefs, channel):
            key = (channel.value, offset)
            if key in seen:
                continue
            scheduled_for = compute_scheduled_for(booking.start_at, offset, now=moment)
            if scheduled_for is None:
                continue
            seen.add(key)
            jobs.append(
                ReminderPlan(
                    channel=channel,
                    offset_minutes=offset,
                    scheduled_for=scheduled_for,
                    to_address=to_address,
                    payload={
                        "client_name": client_name,
                        "service_name": service.name,
                        "business_name": tenant.name,
                        "when_label": when_label,
                        "body": body,
                        "subject": subject,
                        "template_key": TEMPLATE_KEY,
                        "business_logo_url": getattr(tenant, "public_logo_url", None),
                    },
                )
            )
    return jobs


async def _get_or_create_prefs(session: AsyncSession, tenant_id: str) -> NotificationPreference:
    prefs = (
        await session.execute(
            select(NotificationPreference).where(NotificationPreference.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if prefs:
        return prefs
    prefs = NotificationPreference(
        tenant_id=tenant_id,
        reminder_offsets_minutes={key: list(values) for key, values in DEFAULT_CHANNEL_OFFSETS.items()},
    )
    session.add(prefs)
    await session.flush()
    return prefs


async def cancel_pending_reminders(session: AsyncSession, booking_id: str) -> int:
    result = await session.execute(
        update(OutboundMessage)
        .where(
            OutboundMessage.booking_id == booking_id,
            OutboundMessage.purpose == OutboundPurpose.booking_reminder,
            OutboundMessage.status.in_(
                [OutboundMessageStatus.pending, OutboundMessageStatus.failed]
            ),
        )
        .values(status=OutboundMessageStatus.cancelled, updated_at=datetime.now(UTC))
    )
    return int(result.rowcount or 0)


async def schedule_booking_reminders(
    session: AsyncSession,
    *,
    tenant: Tenant,
    booking: Booking,
    client: Client,
    service: Service,
    now: datetime | None = None,
) -> list[OutboundMessage]:
    """Upsert pending reminder jobs for a confirmed booking; cancel leftover offsets."""
    if booking.status != BookingStatus.confirmed:
        await cancel_pending_reminders(session, booking.id)
        return []

    await hydrate_runtime_catalog(session)
    prefs = await _get_or_create_prefs(session, tenant.id)
    desired = plan_reminder_jobs(
        tenant=tenant,
        booking=booking,
        client=client,
        service=service,
        prefs=prefs,
        now=now,
    )
    desired_keys = {(job.channel.value, job.offset_minutes) for job in desired}
    existing_rows = (
        await session.execute(
            select(OutboundMessage).where(
                OutboundMessage.booking_id == booking.id,
                OutboundMessage.purpose == OutboundPurpose.booking_reminder,
            )
        )
    ).scalars().all()
    existing = {(row.channel.value, row.offset_minutes): row for row in existing_rows}
    moment = datetime.now(UTC)
    upserted: list[OutboundMessage] = []

    for job in desired:
        row = existing.get((job.channel.value, job.offset_minutes))
        if row is None:
            row = OutboundMessage(
                tenant_id=tenant.id,
                booking_id=booking.id,
                client_id=client.id,
                channel=job.channel,
                purpose=OutboundPurpose.booking_reminder,
                offset_minutes=job.offset_minutes,
                scheduled_for=job.scheduled_for,
                status=OutboundMessageStatus.pending,
                to_address=job.to_address,
                template_key=TEMPLATE_KEY,
                payload=job.payload,
            )
            session.add(row)
            upserted.append(row)
            continue
        if row.status in {
            OutboundMessageStatus.sent,
            OutboundMessageStatus.skipped,
            OutboundMessageStatus.sending,
        }:
            continue
        row.scheduled_for = job.scheduled_for
        row.to_address = job.to_address
        row.payload = job.payload
        row.status = OutboundMessageStatus.pending
        row.last_error = None
        row.updated_at = moment
        upserted.append(row)

    for key, row in existing.items():
        if key in desired_keys:
            continue
        if row.status in {OutboundMessageStatus.pending, OutboundMessageStatus.failed}:
            row.status = OutboundMessageStatus.cancelled
            row.updated_at = moment

    await session.flush()
    return upserted


async def sync_booking_reminders(session: AsyncSession, booking: Booking) -> None:
    if booking.status != BookingStatus.confirmed:
        await cancel_pending_reminders(session, booking.id)
        return
    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == booking.tenant_id))
    ).scalar_one()
    client = (
        await session.execute(select(Client).where(Client.id == booking.client_id))
    ).scalar_one()
    service = (
        await session.execute(select(Service).where(Service.id == booking.service_id))
    ).scalar_one()
    await schedule_booking_reminders(
        session, tenant=tenant, booking=booking, client=client, service=service
    )


def build_confirmation_body(
    *,
    client_name: str,
    service_name: str,
    business_name: str,
    when_label: str,
) -> str:
    return (
        f"Hi {client_name}, your booking is confirmed: {service_name} with {business_name} on {when_label}. "
        "Reply if you need to reschedule."
    )


def enabled_confirmation_channels(
    prefs: NotificationPreference | None,
    *,
    tenant: Tenant | None = None,
) -> list[OutboundChannel]:
    channels: list[OutboundChannel] = []
    sms_on = bool(getattr(prefs, "sms_enabled", False) and getattr(prefs, "client_reminder_sms", False))
    if sms_on and _channel_allowed_by_plan(tenant, OutboundChannel.sms):
        channels.append(OutboundChannel.sms)
    if (
        prefs is not None
        and getattr(prefs, "client_reminder_whatsapp", False)
        and _channel_allowed_by_plan(tenant, OutboundChannel.whatsapp)
    ):
        channels.append(OutboundChannel.whatsapp)
    return channels


async def queue_booking_confirmations(
    session: AsyncSession,
    *,
    tenant: Tenant,
    booking: Booking,
    client: Client,
    service: Service,
    now: datetime | None = None,
) -> list[OutboundMessage]:
    if booking.status != BookingStatus.confirmed:
        return []
    await hydrate_runtime_catalog(session)
    prefs = await _get_or_create_prefs(session, tenant.id)
    channels = enabled_confirmation_channels(prefs, tenant=tenant)
    if not channels:
        return []

    when_label = format_local_when(
        booking.start_at,
        tenant.timezone or "Africa/Lagos",
        is_all_day=bool(booking.is_all_day),
    )
    client_name = visit_display_name(booking, client)
    body = build_confirmation_body(
        client_name=client_name,
        service_name=service.name,
        business_name=tenant.name,
        when_label=when_label,
    )
    subject = f"Booking confirmed: {service.name} with {tenant.name}"
    moment = now or datetime.now(UTC)
    desired_channels: set[str] = set()
    existing_rows = (
        await session.execute(
            select(OutboundMessage).where(
                OutboundMessage.booking_id == booking.id,
                OutboundMessage.purpose == OutboundPurpose.booking_confirmation,
            )
        )
    ).scalars().all()
    existing = {row.channel.value: row for row in existing_rows}
    queued: list[OutboundMessage] = []

    for channel in channels:
        to_address = destination_for(channel, client)
        if not to_address:
            continue
        desired_channels.add(channel.value)
        payload = {
            "client_name": client_name,
            "service_name": service.name,
            "business_name": tenant.name,
            "when_label": when_label,
            "body": body,
            "subject": subject,
            "template_key": TEMPLATE_KEY_CONFIRMATION,
            "business_logo_url": tenant.public_logo_url,
        }
        row = existing.get(channel.value)
        if row is None:
            row = OutboundMessage(
                tenant_id=tenant.id,
                booking_id=booking.id,
                client_id=client.id,
                channel=channel,
                purpose=OutboundPurpose.booking_confirmation,
                offset_minutes=0,
                scheduled_for=moment,
                status=OutboundMessageStatus.pending,
                to_address=to_address,
                template_key=TEMPLATE_KEY_CONFIRMATION,
                payload=payload,
            )
            session.add(row)
            queued.append(row)
            continue
        if row.status in {
            OutboundMessageStatus.sent,
            OutboundMessageStatus.skipped,
            OutboundMessageStatus.sending,
        }:
            continue
        row.scheduled_for = moment
        row.to_address = to_address
        row.template_key = TEMPLATE_KEY_CONFIRMATION
        row.payload = payload
        row.status = OutboundMessageStatus.pending
        row.last_error = None
        row.updated_at = moment
        queued.append(row)

    for channel_key, row in existing.items():
        if channel_key in desired_channels:
            continue
        if row.status in {OutboundMessageStatus.pending, OutboundMessageStatus.failed}:
            row.status = OutboundMessageStatus.cancelled
            row.updated_at = moment

    await session.flush()
    return queued


async def reschedule_tenant_upcoming_reminders(session: AsyncSession, tenant_id: str) -> int:
    """Re-apply current prefs to upcoming confirmed bookings for this business."""
    now = datetime.now(UTC)
    bookings = (
        await session.execute(
            select(Booking).where(
                Booking.tenant_id == tenant_id,
                Booking.status == BookingStatus.confirmed,
                Booking.start_at > now,
            )
        )
    ).scalars().all()
    for booking in bookings:
        await sync_booking_reminders(session, booking)
    return len(bookings)


def deliver_planned_message(
    *,
    channel: OutboundChannel,
    to_address: str,
    payload: dict,
) -> ProviderResult:
    body = str(payload.get("body") or "")
    adapter = get_adapter(channel)
    return adapter.send(to=to_address, body=body, metadata=payload)


def _retry_delay_minutes(attempts: int) -> int:
    return min(60, 2 ** max(attempts, 1))


async def dispatch_outbound_message(session: AsyncSession, message: OutboundMessage) -> OutboundMessage:
    booking = (
        await session.execute(select(Booking).where(Booking.id == message.booking_id))
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if not booking or booking.status != BookingStatus.confirmed:
        message.status = OutboundMessageStatus.cancelled
        message.last_error = "booking_not_active"
        message.updated_at = now
        return message

    result = deliver_planned_message(
        channel=message.channel,
        to_address=message.to_address,
        payload={
            **(message.payload or {}),
            "template_key": message.template_key,
            "purpose": message.purpose.value,
        },
    )
    message.attempts = int(message.attempts or 0) + 1
    message.provider = result.provider
    message.provider_message_id = result.message_id
    message.updated_at = now
    if result.skipped:
        message.status = OutboundMessageStatus.skipped
        message.last_error = result.skip_reason
        return message
    if result.ok:
        message.status = OutboundMessageStatus.sent
        message.sent_at = now
        message.last_error = None
        return message
    message.last_error = (result.error or "send_failed")[:500]
    if message.attempts >= MAX_SEND_ATTEMPTS:
        message.status = OutboundMessageStatus.failed
    else:
        message.status = OutboundMessageStatus.pending
        message.scheduled_for = now + timedelta(minutes=_retry_delay_minutes(message.attempts))
    return message


async def process_due_messages(
    session: AsyncSession | None = None,
    *,
    now: datetime | None = None,
    acquire_lock: bool = True,
) -> dict[str, int]:
    settings = get_settings()
    stats = {"claimed": 0, "sent": 0, "skipped": 0, "failed": 0, "cancelled": 0}
    if acquire_lock:
        locked = await redis_cache.client.set(
            LOCK_KEY,
            "1",
            nx=True,
            ex=max(30, settings.outbound_poll_interval_seconds),
        )
        if not locked:
            return stats

    try:
        if session is not None:
            return await _drain_due_messages(session, now=now, stats=stats)
        async with SessionLocal() as db:
            return await _drain_due_messages(db, now=now, stats=stats)
    finally:
        if acquire_lock:
            await redis_cache.client.delete(LOCK_KEY)


async def _drain_due_messages(
    db: AsyncSession,
    *,
    now: datetime | None,
    stats: dict[str, int],
) -> dict[str, int]:
    settings = get_settings()
    moment = now or datetime.now(UTC)
    try:
        due = (
            await db.execute(
                select(OutboundMessage)
                .where(
                    OutboundMessage.status == OutboundMessageStatus.pending,
                    OutboundMessage.scheduled_for <= moment,
                )
                .order_by(OutboundMessage.scheduled_for.asc())
                .limit(settings.outbound_batch_size)
            )
        ).scalars().all()
        for message in due:
            message.status = OutboundMessageStatus.sending
        await db.flush()
        stats["claimed"] = len(due)
        for message in due:
            await dispatch_outbound_message(db, message)
            if message.status == OutboundMessageStatus.sent:
                stats["sent"] += 1
            elif message.status == OutboundMessageStatus.skipped:
                stats["skipped"] += 1
            elif message.status == OutboundMessageStatus.failed:
                stats["failed"] += 1
            elif message.status == OutboundMessageStatus.cancelled:
                stats["cancelled"] += 1
        await db.commit()
        return stats
    except Exception:
        await db.rollback()
        logger.exception("outbound.poller_failed")
        raise


async def outbound_poller_loop(stop_event: asyncio.Event) -> None:
    settings = get_settings()
    interval = max(15, int(settings.outbound_poll_interval_seconds))
    while not stop_event.is_set():
        try:
            await process_due_messages()
        except Exception:
            logger.exception("outbound.poller_loop_error")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except TimeoutError:
            continue
        except Exception:
            return
