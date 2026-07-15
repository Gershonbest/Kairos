"""Portable calendar invites and Google Calendar links for bookings."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TypedDict
from urllib.parse import urlencode


class CalendarEventArgs(TypedDict):
    booking_id: str
    business_name: str
    service_name: str
    start_at: datetime
    end_at: datetime
    location: str | None
    host_name: str | None
    host_title: str | None
    appointment_format: str
    client_instructions: str | None
    online_meeting_link: str | None
    is_all_day: bool


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _calendar_timestamp(value: datetime) -> str:
    return _as_utc(value).strftime("%Y%m%dT%H%M%SZ")


def _calendar_date(value: datetime) -> str:
    return _as_utc(value).strftime("%Y%m%d")


def _escape_ics(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
        .replace(";", "\\;")
        .replace(",", "\\,")
    )


def _fold_ics_line(line: str, limit: int = 75) -> list[str]:
    """Fold an ICS line without splitting UTF-8 code points."""
    folded: list[str] = []
    current = ""
    current_bytes = 0
    current_limit = limit

    for char in line:
        char_bytes = len(char.encode("utf-8"))
        if current and current_bytes + char_bytes > current_limit:
            folded.append(current)
            current = " " + char
            current_bytes = 1 + char_bytes
            current_limit = limit
        else:
            current += char
            current_bytes += char_bytes

    folded.append(current)
    return folded


def _event_description(
    *,
    business_name: str,
    appointment_format: str,
    host_name: str | None,
    host_title: str | None,
    client_instructions: str | None,
    online_meeting_link: str | None,
    booking_id: str,
) -> str:
    lines = [
        f"Booking with {business_name}",
        f"Format: {'Online' if appointment_format == 'online' else 'In person'}",
    ]
    if host_name:
        host = host_name
        if host_title:
            host += f" ({host_title})"
        lines.append(f"Host: {host}")
    if online_meeting_link:
        lines.append(f"Join: {online_meeting_link}")
    if client_instructions:
        lines.append(f"Instructions: {client_instructions}")
    lines.append(f"Booking reference: {booking_id}")
    return "\n".join(lines)


def build_booking_ics(
    *,
    booking_id: str,
    business_name: str,
    service_name: str,
    start_at: datetime,
    end_at: datetime,
    location: str | None,
    host_name: str | None,
    host_title: str | None,
    appointment_format: str,
    client_instructions: str | None,
    online_meeting_link: str | None,
    is_all_day: bool = False,
) -> str:
    """Build an RFC 5545 event with a reminder before it starts."""
    description = _event_description(
        business_name=business_name,
        appointment_format=appointment_format,
        host_name=host_name,
        host_title=host_title,
        client_instructions=client_instructions,
        online_meeting_link=online_meeting_link,
        booking_id=booking_id,
    )
    event_location = online_meeting_link or location
    if is_all_day:
        dtstart = f"DTSTART;VALUE=DATE:{_calendar_date(start_at)}"
        dtend = f"DTEND;VALUE=DATE:{_calendar_date(end_at)}"
        alarm_trigger = "-P1D"
    else:
        dtstart = f"DTSTART:{_calendar_timestamp(start_at)}"
        dtend = f"DTEND:{_calendar_timestamp(end_at)}"
        alarm_trigger = "-PT30M"

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Kairos Bookings//Booking Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{_escape_ics(booking_id)}@kairosbookings.com",
        f"DTSTAMP:{_calendar_timestamp(datetime.now(UTC))}",
        dtstart,
        dtend,
        f"SUMMARY:{_escape_ics(f'{service_name} with {business_name}')}",
        f"DESCRIPTION:{_escape_ics(description)}",
    ]
    if event_location:
        lines.append(f"LOCATION:{_escape_ics(event_location)}")
    if online_meeting_link:
        lines.append(f"URL:{_escape_ics(online_meeting_link)}")
    lines.extend(
        [
            "STATUS:CONFIRMED",
            "BEGIN:VALARM",
            f"TRIGGER:{alarm_trigger}",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_escape_ics(f'Reminder: {service_name} with {business_name}')}",
            "END:VALARM",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
    )
    return "\r\n".join(part for line in lines for part in _fold_ics_line(line)) + "\r\n"


def build_google_calendar_url(
    *,
    booking_id: str,
    business_name: str,
    service_name: str,
    start_at: datetime,
    end_at: datetime,
    location: str | None,
    host_name: str | None,
    host_title: str | None,
    appointment_format: str,
    client_instructions: str | None,
    online_meeting_link: str | None,
    is_all_day: bool = False,
) -> str:
    """Build Google's unauthenticated prefilled event URL."""
    description = _event_description(
        business_name=business_name,
        appointment_format=appointment_format,
        host_name=host_name,
        host_title=host_title,
        client_instructions=client_instructions,
        online_meeting_link=online_meeting_link,
        booking_id=booking_id,
    )
    if is_all_day:
        end_date = _as_utc(end_at)
        dates = f"{_calendar_date(start_at)}/{_calendar_date(end_date)}"
    else:
        dates = f"{_calendar_timestamp(start_at)}/{_calendar_timestamp(end_at)}"
    params = {
        "action": "TEMPLATE",
        "text": f"{service_name} with {business_name}",
        "dates": dates,
        "details": description,
        "location": online_meeting_link or location or "",
    }
    return f"https://calendar.google.com/calendar/render?{urlencode(params)}"
