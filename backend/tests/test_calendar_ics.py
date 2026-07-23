"""Calendar invite generation tests."""

from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

from app.infra.calendar_ics import calendar_invite_service


def _calendar_args() -> dict:
    return {
        "booking_id": "booking-123",
        "business_name": "Kairos & Co",
        "service_name": "Travel, Consult",
        "start_at": datetime(2026, 7, 20, 9, 0, tzinfo=UTC),
        "end_at": datetime(2026, 7, 20, 10, 0, tzinfo=UTC),
        "location": "1 Main Street; Abuja",
        "host_name": "Ada",
        "host_title": "Consultant",
        "appointment_format": "onsite",
        "client_instructions": "Bring ID\nArrive early",
        "online_meeting_link": None,
        "is_all_day": False,
    }


def test_build_booking_ics_contains_event_and_reminder() -> None:
    invite = calendar_invite_service.build_booking_ics(**_calendar_args())

    assert invite.startswith("BEGIN:VCALENDAR\r\n")
    assert "UID:booking-123@kairosbookings.com\r\n" in invite
    assert "DTSTART:20260720T090000Z\r\n" in invite
    assert "DTEND:20260720T100000Z\r\n" in invite
    assert "SUMMARY:Travel\\, Consult with Kairos & Co\r\n" in invite
    assert "LOCATION:1 Main Street\\; Abuja\r\n" in invite
    assert "TRIGGER:-PT30M\r\n" in invite
    assert invite.endswith("END:VCALENDAR\r\n")


def test_build_google_calendar_url_contains_prefilled_event() -> None:
    url = calendar_invite_service.build_google_calendar_url(**_calendar_args())
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.netloc == "calendar.google.com"
    assert query["action"] == ["TEMPLATE"]
    assert query["text"] == ["Travel, Consult with Kairos & Co"]
    assert query["dates"] == ["20260720T090000Z/20260720T100000Z"]
    assert query["location"] == ["1 Main Street; Abuja"]


def test_all_day_ics_and_google_url_use_date_values() -> None:
    args = _calendar_args()
    args["is_all_day"] = True
    args["start_at"] = datetime(2026, 7, 20, 0, 0, tzinfo=UTC)
    args["end_at"] = datetime(2026, 7, 21, 0, 0, tzinfo=UTC)

    invite = calendar_invite_service.build_booking_ics(**args)
    assert "DTSTART;VALUE=DATE:20260720\r\n" in invite
    assert "DTEND;VALUE=DATE:20260721\r\n" in invite
    assert "TRIGGER:-P1D\r\n" in invite

    url = calendar_invite_service.build_google_calendar_url(**args)
    query = parse_qs(urlparse(url).query)
    assert query["dates"] == ["20260720/20260721"]
