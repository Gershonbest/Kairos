"""Email provider selection tests."""

import pytest

from app.infra.email import (
    BrevoEmailService,
    CascadingEmailService,
    EmailDeliveryError,
    GoogleEmailService,
    SmtpEmailService,
)


def test_brevo_api_failure_falls_back_to_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    smtp_called = False
    brevo = BrevoEmailService()
    smtp = SmtpEmailService()

    monkeypatch.setattr(brevo, "_api_key", lambda: "xkeysib-test")
    monkeypatch.setattr(brevo, "is_configured", lambda: True)
    monkeypatch.setattr(smtp, "is_configured", lambda: True)

    def fail_brevo(**_kwargs: object) -> None:
        raise EmailDeliveryError("Unable to send email via Brevo API")

    def record_smtp(**_kwargs: object) -> None:
        nonlocal smtp_called
        smtp_called = True

    monkeypatch.setattr(brevo, "send", fail_brevo)
    monkeypatch.setattr(smtp, "send", record_smtp)

    service = CascadingEmailService([brevo, smtp])
    service.send(
        to="client@example.com",
        subject="Booking confirmed",
        html_body="<p>Confirmed</p>",
    )

    assert smtp_called is True


def test_cascading_uses_smtp_when_brevo_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    smtp_called = False
    brevo = BrevoEmailService()
    smtp = SmtpEmailService()

    monkeypatch.setattr(brevo, "is_configured", lambda: False)
    monkeypatch.setattr(smtp, "is_configured", lambda: True)

    def record_smtp(**_kwargs: object) -> None:
        nonlocal smtp_called
        smtp_called = True

    monkeypatch.setattr(smtp, "send", record_smtp)

    CascadingEmailService([brevo, smtp]).send(
        to="client@example.com",
        subject="Hello",
        html_body="<p>Hi</p>",
    )
    assert smtp_called is True


def test_cascading_uses_google_before_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    google_called = False
    smtp_called = False
    google = GoogleEmailService()
    smtp = SmtpEmailService()

    monkeypatch.setattr(google, "is_configured", lambda: True)
    monkeypatch.setattr(smtp, "is_configured", lambda: True)

    def record_google(**_kwargs: object) -> None:
        nonlocal google_called
        google_called = True

    def record_smtp(**_kwargs: object) -> None:
        nonlocal smtp_called
        smtp_called = True

    monkeypatch.setattr(google, "send", record_google)
    monkeypatch.setattr(smtp, "send", record_smtp)

    CascadingEmailService([google, smtp]).send(
        to="client@example.com",
        subject="Hello",
        html_body="<p>Hi</p>",
    )
    assert google_called is True
    assert smtp_called is False
