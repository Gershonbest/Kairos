"""Listing-aware booking conflict and payload mapping regressions."""

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.infra.models import AppointmentFormat
from app.infra.models import ServiceBookingType
from app.modules.bookings.router import _serialize_booking
from app.modules.public.router import _matches_booking_scope
from app.modules.services.helpers import service_to_dict
from app.schemas.services import ServiceCreate


def test_listing_scope_allows_parallel_slots_for_different_listings() -> None:
    service = SimpleNamespace(id="svc-1", booking_type=ServiceBookingType.listing)
    existing_same_time = SimpleNamespace(service_id="svc-1", listing_id="listing-a")

    assert _matches_booking_scope(
        service=service,
        booking=existing_same_time,
        selected_listing_id="listing-a",
    )
    assert not _matches_booking_scope(
        service=service,
        booking=existing_same_time,
        selected_listing_id="listing-b",
    )


def test_general_scope_ignores_listing_bookings() -> None:
    service = SimpleNamespace(id="svc-1", booking_type=ServiceBookingType.general)
    general_booking = SimpleNamespace(service_id="svc-1", listing_id=None)
    listing_booking = SimpleNamespace(service_id="svc-1", listing_id="listing-a")

    assert _matches_booking_scope(
        service=service,
        booking=general_booking,
        selected_listing_id=None,
    )
    assert not _matches_booking_scope(
        service=service,
        booking=listing_booking,
        selected_listing_id=None,
    )


def test_service_payload_includes_booking_type_and_listing_links() -> None:
    service = SimpleNamespace(
        id="svc-1",
        name="Consultation",
        description="",
        duration_minutes=60,
        booking_type=ServiceBookingType.listing,
        scheduling_mode=SimpleNamespace(value="fixed"),
        price_amount=120,
        deposit_amount=30,
        appointment_type=SimpleNamespace(value="onsite"),
        location="Office",
        use_business_location=True,
        host_name="Ada",
        host_title="Consultant",
        client_instructions="",
        buffer_minutes=0,
        image_url=None,
        listings=[SimpleNamespace(id="listing-a"), SimpleNamespace(id="listing-b")],
    )

    payload = service_to_dict(service)

    assert payload["booking_type"] == "listing"
    assert payload["listing_ids"] == ["listing-a", "listing-b"]


def test_service_schema_requires_products_for_product_based_booking() -> None:
    with pytest.raises(ValidationError):
        ServiceCreate(
            name="Vehicle Inspection",
            description="",
            duration_minutes=60,
            booking_type="listing",
            scheduling_mode="fixed",
            price_amount=100,
            deposit_amount=0,
            appointment_type="onsite",
            use_business_location=True,
            buffer_minutes=0,
            listing_ids=[],
            active=True,
        )


def test_service_schema_blocks_products_for_general_booking() -> None:
    with pytest.raises(ValidationError):
        ServiceCreate(
            name="General Consultation",
            description="",
            duration_minutes=60,
            booking_type="general",
            scheduling_mode="fixed",
            price_amount=100,
            deposit_amount=0,
            appointment_type="onsite",
            use_business_location=True,
            buffer_minutes=0,
            listing_ids=["prod-1"],
            active=True,
        )


def test_booking_serializer_includes_product_context() -> None:
    booking = SimpleNamespace(
        id="book-1",
        status=SimpleNamespace(value="confirmed"),
        start_at=SimpleNamespace(isoformat=lambda: "2026-08-10T10:00:00+00:00"),
        end_at=SimpleNamespace(isoformat=lambda: "2026-08-10T11:00:00+00:00"),
        client_id="client-1",
        service_id="service-1",
        listing_id="prod-1",
        notes=None,
        is_all_day=False,
        appointment_format=AppointmentFormat.onsite,
    )
    client = SimpleNamespace(full_name="Ada", email="ada@example.com", phone="123")
    service = SimpleNamespace(
        name="Inspection",
        duration_minutes=60,
        scheduling_mode=SimpleNamespace(value="fixed"),
        host_name=None,
        host_title=None,
        use_business_location=True,
        location=None,
        online_meeting_link=None,
        appointment_type=None,
    )
    tenant = SimpleNamespace(address_line="HQ", state="Lagos", country_code="NG")
    listing = SimpleNamespace(name="Vehicle Unit 14", image_urls=["https://img.example/p1.jpg"])

    payload = _serialize_booking(booking, client, service, tenant, listing)

    assert payload["listing_id"] == "prod-1"
    assert payload["listing_name"] == "Vehicle Unit 14"
    assert payload["listing_image_url"] == "https://img.example/p1.jpg"
