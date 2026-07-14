"""Email provider selection tests."""

import pytest

from app.infra import email


def test_brevo_api_failure_does_not_fall_back_to_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    smtp_called = False

    monkeypatch.setattr(email, "_brevo_http_api_key", lambda: "xkeysib-test")

    def fail_brevo(**_kwargs: object) -> None:
        raise RuntimeError("Brevo rejected request")

    def record_smtp(**_kwargs: object) -> None:
        nonlocal smtp_called
        smtp_called = True

    monkeypatch.setattr(email, "_send_via_brevo_api", fail_brevo)
    monkeypatch.setattr(email, "_send_via_smtp", record_smtp)

    with pytest.raises(email.EmailDeliveryError, match="Brevo API"):
        email.send_email(
            to="client@example.com",
            subject="Booking confirmed",
            html_body="<p>Confirmed</p>",
        )

    assert smtp_called is False
