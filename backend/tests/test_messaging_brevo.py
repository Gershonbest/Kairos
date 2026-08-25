"""SMS/WhatsApp messaging provider adapter tests (Brevo + Termii)."""

from __future__ import annotations

import json

import pytest

from app.core.config import get_settings
from app.infra.messaging import get_adapter, messaging_provider_name, normalize_phone_e164
from app.infra.models import OutboundChannel


class _FakeResponse:
    def __init__(self, *, status_code: int, payload: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text or json.dumps(self._payload)
        self.content = self.text.encode("utf-8")

    def json(self) -> dict:
        return self._payload


def _clear_settings() -> None:
    get_settings.cache_clear()


def test_normalize_phone_e164() -> None:
    assert normalize_phone_e164("+234 801-234-5678") == "2348012345678"
    assert normalize_phone_e164("08012345678") == "2348012345678"
    assert normalize_phone_e164("2348012345678") == "2348012345678"
    assert normalize_phone_e164("0700") is None


def test_messaging_provider_defaults_to_brevo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MESSAGING_PROVIDER", raising=False)
    _clear_settings()
    assert messaging_provider_name() == "brevo"
    _clear_settings()


def test_sms_adapter_calls_brevo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MESSAGING_PROVIDER", "brevo")
    monkeypatch.setenv("MESSAGING_DRY_RUN", "false")
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-test")
    monkeypatch.setenv("BREVO_SMS_SENDER", "Orheo")
    _clear_settings()

    called: dict[str, object] = {}

    def fake_post(url: str, *, headers: dict, json: dict, timeout: float) -> _FakeResponse:
        called["url"] = url
        called["headers"] = headers
        called["json"] = json
        called["timeout"] = timeout
        return _FakeResponse(status_code=201, payload={"messageId": 1511882900100020})

    monkeypatch.setattr("app.infra.messaging.httpx.post", fake_post)
    result = get_adapter(OutboundChannel.sms).send(
        to="+234 801-234-5678",
        body="Your appointment is tomorrow.",
        metadata={"template_key": "booking_reminder"},
    )
    assert result.ok is True
    assert result.skipped is False
    assert result.provider == "brevo_sms"
    assert result.message_id == "1511882900100020"
    assert called["url"] == "https://api.brevo.com/v3/transactionalSMS/send"
    assert called["json"] == {
        "sender": "Orheo",
        "recipient": "2348012345678",
        "content": "Your appointment is tomorrow.",
        "type": "transactional",
        "unicodeEnabled": True,
        "tag": "booking_reminder",
    }
    _clear_settings()


def test_whatsapp_adapter_requires_template(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MESSAGING_PROVIDER", "brevo")
    monkeypatch.setenv("MESSAGING_DRY_RUN", "false")
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-test")
    monkeypatch.setenv("BREVO_WHATSAPP_SENDER", "2348011111111")
    monkeypatch.delenv("BREVO_WHATSAPP_TEMPLATE_REMINDER", raising=False)
    _clear_settings()

    result = get_adapter(OutboundChannel.whatsapp).send(
        to="+2348012345678",
        body="Reminder",
        metadata={"template_key": "booking_reminder"},
    )
    assert result.ok is True
    assert result.skipped is True
    assert result.skip_reason == "not_configured"
    _clear_settings()


def test_whatsapp_confirmation_uses_confirmation_template(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MESSAGING_PROVIDER", "brevo")
    monkeypatch.setenv("MESSAGING_DRY_RUN", "false")
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-test")
    monkeypatch.setenv("BREVO_WHATSAPP_SENDER", "+2348011111111")
    monkeypatch.setenv("BREVO_WHATSAPP_TEMPLATE_CONFIRMATION", "789")
    _clear_settings()

    called: dict[str, object] = {}

    def fake_post(url: str, *, headers: dict, json: dict, timeout: float) -> _FakeResponse:
        called["url"] = url
        called["json"] = json
        return _FakeResponse(status_code=201, payload={"messageId": "wa-msg-1"})

    monkeypatch.setattr("app.infra.messaging.httpx.post", fake_post)
    result = get_adapter(OutboundChannel.whatsapp).send(
        to="08012345678",
        body="Confirmed",
        metadata={"template_key": "booking_confirmation"},
    )
    assert result.ok is True
    assert result.provider == "brevo_whatsapp"
    assert result.message_id == "wa-msg-1"
    assert called["url"] == "https://api.brevo.com/v3/whatsapp/sendMessage"
    assert called["json"] == {
        "senderNumber": "2348011111111",
        "contactNumbers": ["2348012345678"],
        "templateId": 789,
    }
    _clear_settings()


def test_sms_adapter_calls_termii(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MESSAGING_PROVIDER", "termii")
    monkeypatch.setenv("MESSAGING_DRY_RUN", "false")
    monkeypatch.setenv("TERMII_API_KEY", "termii-test-key")
    monkeypatch.setenv("TERMII_BASE_URL", "https://api.ng.termii.com")
    monkeypatch.setenv("TERMII_SMS_SENDER", "Orheo")
    monkeypatch.setenv("TERMII_SMS_CHANNEL", "dnd")
    _clear_settings()

    called: dict[str, object] = {}

    def fake_post(url: str, *, headers: dict, json: dict, timeout: float) -> _FakeResponse:
        called["url"] = url
        called["json"] = json
        return _FakeResponse(
            status_code=200,
            payload={
                "code": "ok",
                "message_id": "3017544054459083819856413",
                "message": "Successfully Sent",
            },
        )

    monkeypatch.setattr("app.infra.messaging.httpx.post", fake_post)
    result = get_adapter(OutboundChannel.sms).send(
        to="+2348012345678",
        body="Reminder: Facial tomorrow",
        metadata={"template_key": "booking_reminder"},
    )
    assert result.ok is True
    assert result.provider == "termii_sms"
    assert result.message_id == "3017544054459083819856413"
    assert called["url"] == "https://api.ng.termii.com/api/sms/send"
    assert called["json"] == {
        "api_key": "termii-test-key",
        "to": "2348012345678",
        "from": "Orheo",
        "sms": "Reminder: Facial tomorrow",
        "type": "plain",
        "channel": "dnd",
    }
    _clear_settings()


def test_whatsapp_adapter_calls_termii(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MESSAGING_PROVIDER", "termii")
    monkeypatch.setenv("MESSAGING_DRY_RUN", "false")
    monkeypatch.setenv("TERMII_API_KEY", "termii-test-key")
    monkeypatch.setenv("TERMII_WHATSAPP_SENDER", "orheo_wa")
    _clear_settings()

    called: dict[str, object] = {}

    def fake_post(url: str, *, headers: dict, json: dict, timeout: float) -> _FakeResponse:
        called["url"] = url
        called["json"] = json
        return _FakeResponse(
            status_code=200,
            payload={"code": "ok", "message_id": "wa-termii-1"},
        )

    monkeypatch.setattr("app.infra.messaging.httpx.post", fake_post)
    result = get_adapter(OutboundChannel.whatsapp).send(
        to="08012345678",
        body="Booking confirmed",
        metadata={"template_key": "booking_confirmation"},
    )
    assert result.ok is True
    assert result.provider == "termii_whatsapp"
    assert result.message_id == "wa-termii-1"
    assert called["json"]["channel"] == "whatsapp"
    assert called["json"]["from"] == "orheo_wa"
    assert called["json"]["to"] == "2348012345678"
    _clear_settings()


def test_termii_whatsapp_not_configured_without_sender(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MESSAGING_PROVIDER", "termii")
    monkeypatch.setenv("MESSAGING_DRY_RUN", "false")
    monkeypatch.setenv("TERMII_API_KEY", "termii-test-key")
    monkeypatch.delenv("TERMII_WHATSAPP_SENDER", raising=False)
    _clear_settings()

    result = get_adapter(OutboundChannel.whatsapp).send(
        to="+2348012345678",
        body="Hello",
        metadata={},
    )
    assert result.skipped is True
    assert result.skip_reason == "not_configured"
    _clear_settings()
