from types import SimpleNamespace

from app.modules.clients.names import compose_full_name, split_person_name, visit_display_name
from app.schemas.bookings import PublicBookingCreateRequest


def test_split_and_compose_names() -> None:
    assert split_person_name("Jane Doe") == ("Jane", "Doe")
    assert split_person_name("Ada Grace Obi") == ("Ada", "Grace Obi")
    assert split_person_name("Gershon") == ("Gershon", "")
    assert compose_full_name("Jane", "Doe") == "Jane Doe"


def test_visit_display_name_prefers_guest_alias() -> None:
    booking = SimpleNamespace(guest_first_name="Alex", guest_last_name="Chen")
    client = SimpleNamespace(full_name="Jane Doe", first_name="Jane", last_name="Doe")
    assert visit_display_name(booking, client) == "Alex Chen"


def test_public_booking_payload_requires_first_and_last() -> None:
    payload = PublicBookingCreateRequest(
        service_id="svc-1",
        start_at="2026-08-18T10:00:00+00:00",
        client_first_name="Jane",
        client_last_name="Doe",
        client_email="jane@example.com",
        idempotency_key="web-123456",
    )
    assert payload.client_name == "Jane Doe"
    assert payload.client_first_name == "Jane"
    assert payload.client_last_name == "Doe"


def test_public_booking_payload_accepts_legacy_full_name() -> None:
    payload = PublicBookingCreateRequest(
        service_id="svc-1",
        start_at="2026-08-18T10:00:00+00:00",
        client_name="Alex Chen",
        client_email="alex@example.com",
        idempotency_key="web-123456",
    )
    assert payload.client_first_name == "Alex"
    assert payload.client_last_name == "Chen"
