"""Slot generation and smart scheduling insights."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.models import AvailabilityRule, Booking, BookingStatus, Service


def _parse_time(value: str) -> time:
    hour, minute = [int(part) for part in value.split(":")]
    return time(hour, minute)


def booking_blocks_slot(
    booking: Booking,
    slot_start: datetime,
    slot_end: datetime,
    buffer_minutes: int,
) -> bool:
    blocked_until = booking.end_at + timedelta(minutes=buffer_minutes)
    return booking.start_at < slot_end and blocked_until > slot_start


def generate_slots(
    *,
    from_dt: datetime,
    to_dt: datetime,
    service: Service,
    rules: list[AvailabilityRule],
    existing_bookings: list[Booking],
) -> list[str]:
    rules_by_day: dict[int, list[AvailabilityRule]] = defaultdict(list)
    for rule in rules:
        if rule.is_enabled:
            rules_by_day[rule.day_of_week].append(rule)

    slots: list[str] = []
    buffer_minutes = service.buffer_minutes or 0
    active_bookings = [
        booking
        for booking in existing_bookings
        if booking.status in (BookingStatus.pending, BookingStatus.confirmed)
    ]
    current_day = from_dt.date()
    final_day = to_dt.date()
    is_all_day = getattr(service.scheduling_mode, "value", service.scheduling_mode) == "all_day"

    while current_day <= final_day:
        configured_day = (current_day.weekday() + 1) % 7
        day_rules = rules_by_day.get(configured_day, [])
        if not day_rules:
            current_day += timedelta(days=1)
            continue

        if is_all_day:
            day_start = datetime.combine(current_day, time.min, tzinfo=UTC)
            day_end = day_start + timedelta(days=1)
            if day_start < from_dt or day_start > to_dt:
                current_day += timedelta(days=1)
                continue
            has_conflict = any(
                booking_blocks_slot(booking, day_start, day_end, buffer_minutes)
                for booking in active_bookings
            )
            if not has_conflict:
                slots.append(day_start.isoformat())
            current_day += timedelta(days=1)
            continue

        duration = timedelta(minutes=service.duration_minutes)
        slot_step = timedelta(minutes=max(service.duration_minutes, 15))
        for rule in day_rules:
            window_start = datetime.combine(current_day, _parse_time(rule.start_time), tzinfo=UTC)
            window_end = datetime.combine(current_day, _parse_time(rule.end_time), tzinfo=UTC)
            cursor = window_start
            while cursor + duration <= window_end:
                if cursor < from_dt or cursor > to_dt:
                    cursor += slot_step
                    continue
                slot_end = cursor + duration
                has_conflict = any(
                    booking_blocks_slot(booking, cursor, slot_end, buffer_minutes)
                    for booking in active_bookings
                )
                if not has_conflict:
                    slots.append(cursor.isoformat())
                cursor += slot_step
        current_day += timedelta(days=1)

    return slots


async def load_scheduling_context(
    session: AsyncSession,
    tenant_id: str,
    *,
    from_dt: datetime | None = None,
    to_dt: datetime | None = None,
) -> tuple[list[AvailabilityRule], list[Booking], list[Service]]:
    if from_dt is None:
        from_dt = datetime.now(UTC)
    if to_dt is None:
        to_dt = from_dt + timedelta(days=14)

    rules = (
        await session.execute(
            select(AvailabilityRule).where(AvailabilityRule.tenant_id == tenant_id)
        )
    ).scalars().all()
    bookings = (
        await session.execute(
            select(Booking).where(
                Booking.tenant_id == tenant_id,
                Booking.start_at >= from_dt - timedelta(days=30),
                Booking.start_at <= to_dt + timedelta(days=1),
            )
        )
    ).scalars().all()
    services = (
        await session.execute(
            select(Service).where(Service.tenant_id == tenant_id, Service.active.is_(True))
        )
    ).scalars().all()
    return rules, bookings, services


def _format_slot_label(slot_iso: str) -> str:
    dt = datetime.fromisoformat(slot_iso.replace("Z", "+00:00"))
    return dt.strftime("%A, %b %d at %I:%M %p").lstrip("0")


def build_scheduling_insights(
    *,
    rules: list[AvailabilityRule],
    bookings: list[Booking],
    services: list[Service],
    from_dt: datetime,
    to_dt: datetime,
) -> dict:
    active_bookings = [
        booking
        for booking in bookings
        if booking.status in (BookingStatus.pending, BookingStatus.confirmed, BookingStatus.completed)
    ]
    upcoming = sorted(
        [b for b in active_bookings if b.start_at >= from_dt and b.status != BookingStatus.cancelled],
        key=lambda b: b.start_at,
    )[:8]

    primary_service = services[0] if services else None
    open_slots: list[str] = []
    if primary_service:
        open_slots = generate_slots(
            from_dt=from_dt,
            to_dt=to_dt,
            service=primary_service,
            rules=rules,
            existing_bookings=active_bookings,
        )

    # Detect schedule gaps (60+ min between bookings on same day).
    gaps: list[dict] = []
    by_day: dict[date, list[Booking]] = defaultdict(list)
    for booking in active_bookings:
        if booking.start_at >= from_dt and booking.start_at <= to_dt:
            by_day[booking.start_at.date()].append(booking)
    for day, day_bookings in sorted(by_day.items()):
        ordered = sorted(day_bookings, key=lambda b: b.start_at)
        for index in range(len(ordered) - 1):
            gap_minutes = int((ordered[index + 1].start_at - ordered[index].end_at).total_seconds() / 60)
            if gap_minutes >= 60:
                gaps.append(
                    {
                        "date": day.isoformat(),
                        "start": ordered[index].end_at.isoformat(),
                        "end": ordered[index + 1].start_at.isoformat(),
                        "minutes": gap_minutes,
                    }
                )

    day_counts = Counter(booking.start_at.strftime("%A") for booking in active_bookings)
    peak_day = day_counts.most_common(1)[0][0] if day_counts else None

    utilization = 0.0
    if open_slots:
        booked_in_range = len([b for b in active_bookings if from_dt <= b.start_at <= to_dt])
        utilization = round(booked_in_range / max(len(open_slots), 1) * 100, 1)

    recommended = open_slots[:5]
    suggestions: list[str] = []
    if gaps:
        top_gap = gaps[0]
        suggestions.append(
            f"Open a {top_gap['minutes']}-minute express slot on "
            f"{datetime.fromisoformat(top_gap['date']).strftime('%A')} to fill a calendar gap."
        )
    if peak_day:
        suggestions.append(f"{peak_day}s are your busiest day — consider premium pricing or buffer time.")
    if utilization < 40 and open_slots:
        suggestions.append("Utilization is low this week — promote last-minute openings to boost bookings.")
    if not suggestions:
        suggestions.append("Your calendar looks healthy. Keep buffer time between back-to-back appointments.")

    return {
        "from": from_dt.isoformat(),
        "to": to_dt.isoformat(),
        "open_slots": open_slots[:20],
        "recommended_slots": recommended,
        "upcoming_bookings": [
            {
                "id": booking.id,
                "start_at": booking.start_at.isoformat(),
                "end_at": booking.end_at.isoformat(),
                "status": booking.status.value,
            }
            for booking in upcoming
        ],
        "schedule_gaps": gaps[:5],
        "peak_day": peak_day,
        "utilization_pct": utilization,
        "suggestions": suggestions,
    }


def format_insights_reply(message: str, insights: dict, bookings_meta: list[dict]) -> tuple[str, list[str]]:
    lower = message.lower()
    suggestions = insights.get("suggestions", [])

    if any(word in lower for word in ("available", "slots", "availability", "open")):
        slots = insights.get("open_slots", [])[:6]
        if not slots:
            return (
                "I couldn't find open slots in the next two weeks. "
                "Check your availability rules or reduce buffer time on services.",
                ["Show scheduling insights", "View upcoming appointments"],
            )
        lines = "\n".join(f"• {_format_slot_label(slot)}" for slot in slots)
        return (
            f"Here are your next available slots:\n\n{lines}\n\n"
            "These account for existing bookings and service buffer time.",
            ["Suggest optimal times", "Show upcoming appointments"],
        )

    if any(word in lower for word in ("upcoming", "appointment", "calendar", "today", "tomorrow")):
        if not bookings_meta:
            return (
                "You have no upcoming appointments in the next two weeks.",
                ["Find available slots", "Get scheduling insights"],
            )
        lines = "\n".join(
            f"• {row['start_label']} — {row['client_name']} ({row['service_name']})"
            for row in bookings_meta[:6]
        )
        return (
            f"Upcoming appointments:\n\n{lines}",
            ["Find available slots", "Suggest optimal times"],
        )

    if any(word in lower for word in ("optimal", "suggest", "insight", "optimize", "smart")):
        rec = insights.get("recommended_slots", [])[:4]
        rec_lines = "\n".join(f"• {_format_slot_label(slot)}" for slot in rec) if rec else "• No openings found"
        insight_lines = "\n".join(f"✨ {item}" for item in suggestions[:3])
        util = insights.get("utilization_pct", 0)
        peak = insights.get("peak_day") or "N/A"
        return (
            f"Smart scheduling insights:\n\n"
            f"📊 Utilization: {util}%\n"
            f"📈 Peak day: {peak}\n\n"
            f"Recommended openings:\n{rec_lines}\n\n"
            f"{insight_lines}",
            ["Find available slots", "Show upcoming appointments"],
        )

    return (
        "I can help with your calendar. Try asking about available slots, upcoming appointments, "
        "or smart scheduling suggestions.",
        ["Find available slots", "Show upcoming appointments", "Suggest optimal times"],
    )
