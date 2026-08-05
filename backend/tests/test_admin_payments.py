"""Tests for admin payment log serialization and audit helper."""

from app.infra.models import PaymentStatus, PaymentTransaction
from app.modules.admin.router import _serialize_payment_row
from app.modules.audit.service import request_client_meta


def test_serialize_payment_row_includes_client_and_amounts() -> None:
    tx = PaymentTransaction(
        id="tx-1",
        tenant_id="tenant-1",
        booking_id="booking-1",
        provider="paystack",
        provider_reference="ref_abc",
        status=PaymentStatus.succeeded,
        amount=5000,
        currency="NGN",
        platform_fee_amount=250,
        tenant_settlement_amount=4750,
        purpose="booking",
        idempotency_key="idem-1",
    )
    row = _serialize_payment_row(
        tx,
        tenant_name="Salon A",
        client_name="Ada Lovelace",
        client_email="ada@example.com",
        client_phone="+2348000000000",
    )
    assert row["tenant_name"] == "Salon A"
    assert row["client_name"] == "Ada Lovelace"
    assert row["client_email"] == "ada@example.com"
    assert row["amount"] == 5000.0
    assert row["platform_fee_amount"] == 250.0
    assert row["status"] == "succeeded"
    assert row["provider_reference"] == "ref_abc"


def test_request_client_meta_without_request() -> None:
    assert request_client_meta(None) == (None, None)
