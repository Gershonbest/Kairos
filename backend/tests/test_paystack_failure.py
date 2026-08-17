"""Paystack failure classification helpers."""

from app.modules.payments.service import classify_paystack_status


def test_classify_paystack_success() -> None:
    assert classify_paystack_status("success") == "success"
    assert classify_paystack_status("SUCCESS") == "success"


def test_classify_paystack_failed() -> None:
    assert classify_paystack_status("failed") == "failed"
    assert classify_paystack_status("abandoned") == "failed"
    assert classify_paystack_status("reversed") == "failed"
    assert classify_paystack_status("cancelled") == "failed"


def test_classify_paystack_pending() -> None:
    assert classify_paystack_status("pending") == "pending"
    assert classify_paystack_status("ongoing") == "pending"
    assert classify_paystack_status("processing") == "pending"
    assert classify_paystack_status(None) == "pending"
    assert classify_paystack_status("") == "pending"
