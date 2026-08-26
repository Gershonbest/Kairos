"""Channel adapters for booking reminders and confirmations."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

import httpx
import structlog

from app.core.config import get_settings
from app.infra.email import EmailDeliveryError, email_service
from app.infra.models import OutboundChannel
from app.modules.notifications.email_layout import plain_text_to_html, wrap_email_html

logger = structlog.get_logger()


@dataclass(frozen=True)
class ProviderResult:
    ok: bool
    provider: str
    skipped: bool = False
    skip_reason: str | None = None
    message_id: str | None = None
    error: str | None = None


class ChannelAdapter(Protocol):
    provider_name: str

    def send(self, *, to: str, body: str, metadata: dict) -> ProviderResult: ...


BREVO_HTTP_KEY_PREFIX = "xkeysib-"
BREVO_SMS_API_URL = "https://api.brevo.com/v3/transactionalSMS/send"
BREVO_WHATSAPP_API_URL = "https://api.brevo.com/v3/whatsapp/sendMessage"
TEMPLATE_KEY_REMINDER = "booking_reminder"
TEMPLATE_KEY_CONFIRMATION = "booking_confirmation"
SUPPORTED_MESSAGING_PROVIDERS = frozenset({"brevo", "termii"})


def _brevo_api_key() -> str | None:
    key = (get_settings().brevo_api_key or "").strip()
    if not key.startswith(BREVO_HTTP_KEY_PREFIX):
        return None
    return key


def messaging_provider_name() -> str:
    raw = (get_settings().messaging_provider or "brevo").strip().lower()
    if raw not in SUPPORTED_MESSAGING_PROVIDERS:
        logger.warning("messaging.unknown_provider", provider=raw, fallback="brevo")
        return "brevo"
    return raw


def normalize_phone_e164(value: str | None, *, default_country_code: str = "234") -> str | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None

    keep_plus = raw.startswith("+")
    cleaned = "".join(ch for ch in raw if ch.isdigit() or ch == "+")
    digits = cleaned.lstrip("+")
    if not digits:
        return None
    if cleaned.startswith("00"):
        digits = digits[2:]
    elif not keep_plus and digits.startswith("0") and len(digits) == 11:
        # Legacy forms like 08012345678 -> 2348012345678.
        digits = f"{default_country_code}{digits[1:]}"
    if len(digits) < 8:
        return None
    return digits


# Back-compat alias used by older tests/imports.
normalize_phone_for_brevo = normalize_phone_e164


class EmailAdapter:
    provider_name = "email"

    def send(self, *, to: str, body: str, metadata: dict) -> ProviderResult:
        subject = str(metadata.get("subject") or "Booking reminder")
        business_logo_url = metadata.get("business_logo_url")
        html = wrap_email_html(
            inner_html=plain_text_to_html(body),
            preheader=subject,
            business_logo_url=str(business_logo_url) if business_logo_url else None,
        )
        try:
            if not email_service.is_configured():
                settings = get_settings()
                if settings.messaging_dry_run or settings.app_env == "dev":
                    logger.info("messaging.email_dry_run", to=to, subject=subject)
                    return ProviderResult(ok=True, provider="email-stub")
                return ProviderResult(
                    ok=True,
                    provider="email",
                    skipped=True,
                    skip_reason="not_configured",
                )
            email_service.send(to=to, subject=subject, html_body=html, text_body=body)
            return ProviderResult(ok=True, provider=getattr(email_service, "provider_name", "email"))
        except EmailDeliveryError as exc:
            return ProviderResult(ok=False, provider="email", error=str(exc))
        except Exception as exc:
            logger.exception("messaging.email_failed", to=to)
            return ProviderResult(ok=False, provider="email", error=str(exc))


class BrevoSmsAdapter:
    provider_name = "brevo_sms"

    def send(self, *, to: str, body: str, metadata: dict) -> ProviderResult:
        settings = get_settings()
        recipient = normalize_phone_e164(to)
        if not recipient:
            return ProviderResult(
                ok=True,
                provider=self.provider_name,
                skipped=True,
                skip_reason="invalid_destination",
            )
        if settings.messaging_dry_run:
            logger.info("messaging.sms_dry_run", to=recipient, provider=self.provider_name)
            return ProviderResult(ok=True, provider=self.provider_name, message_id="dry-run")

        api_key = _brevo_api_key()
        sender = (settings.brevo_sms_sender or "").strip()
        if not api_key or not sender:
            logger.info("messaging.sms_not_configured", provider=self.provider_name)
            return ProviderResult(
                ok=True,
                provider=self.provider_name,
                skipped=True,
                skip_reason="not_configured",
            )

        payload = {
            "sender": sender,
            "recipient": recipient,
            "content": body,
            "type": "transactional",
            "unicodeEnabled": True,
        }
        tag = metadata.get("template_key")
        if tag:
            payload["tag"] = str(tag)
        try:
            response = httpx.post(
                BREVO_SMS_API_URL,
                headers={
                    "api-key": api_key,
                    "accept": "application/json",
                    "content-type": "application/json",
                },
                json=payload,
                timeout=30.0,
            )
            if response.status_code >= 400:
                return ProviderResult(
                    ok=False,
                    provider=self.provider_name,
                    error=f"Brevo SMS {response.status_code}: {response.text[:220]}",
                )
            data = response.json() if response.content else {}
            message_id = str(data.get("messageId") or "")
            return ProviderResult(ok=True, provider=self.provider_name, message_id=message_id or None)
        except Exception as exc:
            logger.exception("messaging.sms_send_failed", to=recipient, provider=self.provider_name)
            return ProviderResult(ok=False, provider=self.provider_name, error=str(exc))


class BrevoWhatsAppAdapter:
    provider_name = "brevo_whatsapp"

    def _template_id(self, metadata: Mapping[str, object]) -> int | None:
        explicit = metadata.get("whatsapp_template_id")
        if isinstance(explicit, int):
            return explicit
        settings = get_settings()
        template_key = str(metadata.get("template_key") or TEMPLATE_KEY_REMINDER)
        if template_key == TEMPLATE_KEY_CONFIRMATION:
            return settings.brevo_whatsapp_template_confirmation
        return settings.brevo_whatsapp_template_reminder

    def send(self, *, to: str, body: str, metadata: dict) -> ProviderResult:
        settings = get_settings()
        recipient = normalize_phone_e164(to)
        if not recipient:
            return ProviderResult(
                ok=True,
                provider=self.provider_name,
                skipped=True,
                skip_reason="invalid_destination",
            )
        if settings.messaging_dry_run:
            logger.info(
                "messaging.whatsapp_dry_run",
                to=recipient,
                provider=self.provider_name,
                template=metadata.get("template_key"),
            )
            return ProviderResult(ok=True, provider=self.provider_name, message_id="dry-run")

        api_key = _brevo_api_key()
        sender = normalize_phone_e164(settings.brevo_whatsapp_sender)
        template_id = self._template_id(metadata)
        if not api_key or not sender or not template_id:
            logger.info("messaging.whatsapp_not_configured", provider=self.provider_name)
            return ProviderResult(
                ok=True,
                provider=self.provider_name,
                skipped=True,
                skip_reason="not_configured",
            )

        payload = {
            "senderNumber": sender,
            "contactNumbers": [recipient],
            "templateId": int(template_id),
        }
        try:
            response = httpx.post(
                BREVO_WHATSAPP_API_URL,
                headers={
                    "api-key": api_key,
                    "accept": "application/json",
                    "content-type": "application/json",
                },
                json=payload,
                timeout=30.0,
            )
            if response.status_code >= 400:
                return ProviderResult(
                    ok=False,
                    provider=self.provider_name,
                    error=f"Brevo WhatsApp {response.status_code}: {response.text[:220]}",
                )
            data = response.json() if response.content else {}
            message_id = str(data.get("messageId") or "")
            return ProviderResult(ok=True, provider=self.provider_name, message_id=message_id or None)
        except Exception as exc:
            logger.exception("messaging.whatsapp_send_failed", to=recipient, provider=self.provider_name)
            return ProviderResult(ok=False, provider=self.provider_name, error=str(exc))


class TermiiSmsAdapter:
    provider_name = "termii_sms"

    def send(self, *, to: str, body: str, metadata: dict) -> ProviderResult:
        settings = get_settings()
        recipient = normalize_phone_e164(to)
        if not recipient:
            return ProviderResult(
                ok=True,
                provider=self.provider_name,
                skipped=True,
                skip_reason="invalid_destination",
            )
        if settings.messaging_dry_run:
            logger.info("messaging.sms_dry_run", to=recipient, provider=self.provider_name)
            return ProviderResult(ok=True, provider=self.provider_name, message_id="dry-run")

        api_key = (settings.termii_api_key or "").strip()
        sender = (settings.termii_sms_sender or "").strip()
        channel = (settings.termii_sms_channel or "dnd").strip().lower() or "dnd"
        if channel not in {"dnd", "generic"}:
            channel = "dnd"
        if not api_key or not sender:
            logger.info("messaging.sms_not_configured", provider=self.provider_name)
            return ProviderResult(
                ok=True,
                provider=self.provider_name,
                skipped=True,
                skip_reason="not_configured",
            )

        base = (settings.termii_base_url or "https://api.ng.termii.com").rstrip("/")
        payload = {
            "api_key": api_key,
            "to": recipient,
            "from": sender,
            "sms": body,
            "type": "plain",
            "channel": channel,
        }
        try:
            response = httpx.post(
                f"{base}/api/sms/send",
                headers={"content-type": "application/json", "accept": "application/json"},
                json=payload,
                timeout=30.0,
            )
            if response.status_code >= 400:
                return ProviderResult(
                    ok=False,
                    provider=self.provider_name,
                    error=f"Termii SMS {response.status_code}: {response.text[:220]}",
                )
            data = response.json() if response.content else {}
            if str(data.get("code") or "").lower() not in {"", "ok"}:
                return ProviderResult(
                    ok=False,
                    provider=self.provider_name,
                    error=f"Termii SMS rejected: {str(data.get('message') or data)[:220]}",
                )
            message_id = str(data.get("message_id") or data.get("message_id_str") or "")
            return ProviderResult(ok=True, provider=self.provider_name, message_id=message_id or None)
        except Exception as exc:
            logger.exception("messaging.sms_send_failed", to=recipient, provider=self.provider_name)
            return ProviderResult(ok=False, provider=self.provider_name, error=str(exc))


class TermiiWhatsAppAdapter:
    provider_name = "termii_whatsapp"

    def send(self, *, to: str, body: str, metadata: dict) -> ProviderResult:
        settings = get_settings()
        recipient = normalize_phone_e164(to)
        if not recipient:
            return ProviderResult(
                ok=True,
                provider=self.provider_name,
                skipped=True,
                skip_reason="invalid_destination",
            )
        if settings.messaging_dry_run:
            logger.info(
                "messaging.whatsapp_dry_run",
                to=recipient,
                provider=self.provider_name,
                template=metadata.get("template_key"),
            )
            return ProviderResult(ok=True, provider=self.provider_name, message_id="dry-run")

        api_key = (settings.termii_api_key or "").strip()
        sender = (settings.termii_whatsapp_sender or "").strip()
        if not api_key or not sender:
            logger.info("messaging.whatsapp_not_configured", provider=self.provider_name)
            return ProviderResult(
                ok=True,
                provider=self.provider_name,
                skipped=True,
                skip_reason="not_configured",
            )

        base = (settings.termii_base_url or "https://api.ng.termii.com").rstrip("/")
        payload = {
            "api_key": api_key,
            "to": recipient,
            "from": sender,
            "sms": body,
            "type": "plain",
            "channel": "whatsapp",
        }
        try:
            response = httpx.post(
                f"{base}/api/sms/send",
                headers={"content-type": "application/json", "accept": "application/json"},
                json=payload,
                timeout=30.0,
            )
            if response.status_code >= 400:
                return ProviderResult(
                    ok=False,
                    provider=self.provider_name,
                    error=f"Termii WhatsApp {response.status_code}: {response.text[:220]}",
                )
            data = response.json() if response.content else {}
            if str(data.get("code") or "").lower() not in {"", "ok"}:
                return ProviderResult(
                    ok=False,
                    provider=self.provider_name,
                    error=f"Termii WhatsApp rejected: {str(data.get('message') or data)[:220]}",
                )
            message_id = str(data.get("message_id") or data.get("message_id_str") or "")
            return ProviderResult(ok=True, provider=self.provider_name, message_id=message_id or None)
        except Exception as exc:
            logger.exception("messaging.whatsapp_send_failed", to=recipient, provider=self.provider_name)
            return ProviderResult(ok=False, provider=self.provider_name, error=str(exc))


class VoiceAdapter:
    provider_name = "voice"

    def send(self, *, to: str, body: str, metadata: dict) -> ProviderResult:
        logger.info("messaging.voice_not_configured", to=to, template=metadata.get("template_key"))
        return ProviderResult(ok=True, provider=self.provider_name, skipped=True, skip_reason="not_configured")


_EMAIL = EmailAdapter()
_VOICE = VoiceAdapter()
_BREVO_SMS = BrevoSmsAdapter()
_BREVO_WHATSAPP = BrevoWhatsAppAdapter()
_TERMII_SMS = TermiiSmsAdapter()
_TERMII_WHATSAPP = TermiiWhatsAppAdapter()


def get_adapter(channel: OutboundChannel) -> ChannelAdapter:
    if channel == OutboundChannel.email:
        return _EMAIL
    if channel == OutboundChannel.voice:
        return _VOICE
    provider = messaging_provider_name()
    if provider == "termii":
        if channel == OutboundChannel.sms:
            return _TERMII_SMS
        if channel == OutboundChannel.whatsapp:
            return _TERMII_WHATSAPP
    if channel == OutboundChannel.sms:
        return _BREVO_SMS
    if channel == OutboundChannel.whatsapp:
        return _BREVO_WHATSAPP
    return _VOICE
