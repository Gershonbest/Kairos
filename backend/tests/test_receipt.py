"""Booking receipt content tests."""

from datetime import UTC, datetime

from app.modules.notifications.receipt import BookingReceiptData, build_receipt_html, build_receipt_plain_text
from app.modules.notifications.service import send_subscription_payment_receipt_email


def _receipt() -> BookingReceiptData:
    return BookingReceiptData(
        booking_id="booking-123",
        client_name="Ada",
        client_email="ada@example.com",
        business_name="Alpha Consultancy",
        business_logo_url=None,
        business_contact_email="owner@alpha.test",
        service_name="Hair making",
        start_at=datetime(2026, 7, 22, 12, 0, tzinfo=UTC),
        end_at=datetime(2026, 7, 22, 13, 0, tzinfo=UTC),
        is_all_day=False,
        appointment_format="onsite",
        location="Abuja",
        host_name="Ngozi",
        host_title="Stylist",
        client_instructions="Come on time",
        online_meeting_link=None,
        amount_paid=5000,
        currency="NGN",
        payment_reference="ps_abc_123",
        payment_status="succeeded",
        paid_at=datetime(2026, 7, 20, 15, 0, tzinfo=UTC),
        service_price=15000,
        service_deposit=5000,
    )


def test_receipt_plain_text_shows_tenant_and_payment_ref() -> None:
    text = build_receipt_plain_text(_receipt())
    assert "Paid to: Alpha Consultancy" in text
    assert "Payment reference: ps_abc_123" in text
    assert "Amount paid: ₦5,000.00" in text
    assert "Booking reference: booking-123" in text


def test_receipt_html_download_document_includes_print_hint() -> None:
    html = build_receipt_html(_receipt())
    assert "Payment receipt" in html
    assert "Alpha Consultancy" in html
    assert "ps_abc_123" in html
    assert "Save as PDF" in html


def test_subscription_receipt_contains_payment_details(monkeypatch) -> None:
    sent: dict = {}

    def capture_send(**kwargs) -> None:
        sent.update(kwargs)

    monkeypatch.setattr(
        "app.modules.notifications.service.email_service.send",
        capture_send,
    )

    delivered = send_subscription_payment_receipt_email(
        to="owner@alpha.test",
        customer_name="Ada",
        business_name="Alpha Consultancy",
        plan_name="Premium",
        amount=25_000,
        currency="NGN",
        payment_reference="sub_premium_abc123",
        paid_at=datetime(2026, 8, 5, 12, 0, tzinfo=UTC),
        paid_until=datetime(2026, 9, 4, 12, 0, tzinfo=UTC),
    )

    assert delivered is True
    assert sent["to"] == "owner@alpha.test"
    assert sent["subject"] == "Payment receipt — Premium plan"
    assert "₦25,000.00" in sent["text_body"]
    assert "sub_premium_abc123" in sent["html_body"]
