"""Brevo HTTP API email provider."""

from __future__ import annotations

import base64

import httpx
import structlog

from app.core.config import get_settings
from app.infra.email.base import BaseEmailService, EmailAttachment, EmailDeliveryError

logger = structlog.get_logger()

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
BREVO_HTTP_KEY_PREFIX = "xkeysib-"
BREVO_SMTP_KEY_PREFIX = "xsmtpsib-"


class BrevoEmailService(BaseEmailService):
    """Send mail through Brevo's transactional HTTP API (xkeysib- keys)."""

    provider_name = "brevo_api"

    def __init__(
        self,
        *,
        api_url: str = BREVO_API_URL,
        http_key_prefix: str = BREVO_HTTP_KEY_PREFIX,
        smtp_key_prefix: str = BREVO_SMTP_KEY_PREFIX,
    ):
        self.api_url = api_url
        self.http_key_prefix = http_key_prefix
        self.smtp_key_prefix = smtp_key_prefix

    def _api_key(self) -> str | None:
        key = (get_settings().brevo_api_key or "").strip()
        if not key.startswith(self.http_key_prefix):
            return None
        return key

    def is_configured(self) -> bool:
        return self._api_key() is not None

    def log_config_status(self) -> None:
        settings = get_settings()
        api_key = (settings.brevo_api_key or "").strip()
        if api_key.startswith(self.smtp_key_prefix):
            logger.warning(
                "email.config_invalid",
                provider=self.provider_name,
                detail="BREVO_API_KEY contains an SMTP key (xsmtpsib-). "
                "Create an API key (xkeysib-) at https://my.brevo.com/account/settings "
                "or leave BREVO_API_KEY empty to use SMTP only.",
            )
        elif api_key and not api_key.startswith(self.http_key_prefix):
            logger.warning(
                "email.config_invalid",
                provider=self.provider_name,
                detail="BREVO_API_KEY should start with xkeysib-.",
            )
        elif api_key.startswith(self.http_key_prefix):
            logger.info(
                "email.config",
                provider=self.provider_name,
                from_email=settings.smtp_from_email,
            )

    def send(
        self,
        *,
        to: str,
        subject: str,
        html_body: str,
        text_body: str | None = None,
        attachments: list[EmailAttachment] | None = None,
    ) -> None:
        api_key = self._api_key()
        if not api_key:
            raise EmailDeliveryError("Brevo API key is not configured")

        settings = get_settings()
        plain = text_body or self.html_to_plain(html_body)
        payload = {
            "sender": {"name": settings.smtp_from_name, "email": settings.smtp_from_email},
            "to": [{"email": to}],
            "subject": subject,
            "htmlContent": html_body,
            "textContent": plain,
        }
        if attachments:
            payload["attachment"] = [
                {
                    "name": attachment.filename,
                    "content": base64.b64encode(attachment.content).decode("ascii"),
                }
                for attachment in attachments
            ]

        try:
            response = httpx.post(
                self.api_url,
                headers={
                    "api-key": api_key,
                    "accept": "application/json",
                    "content-type": "application/json",
                },
                json=payload,
                timeout=30.0,
            )
            if response.status_code >= 400:
                raise RuntimeError(f"Brevo API {response.status_code}: {response.text}")
        except Exception as exc:
            logger.exception("email.brevo_api_failed", to=to, subject=subject)
            self.log_dev_fallback(to=to, subject=subject, text_body=plain, error=exc)
            raise EmailDeliveryError("Unable to send email via Brevo API") from exc

        logger.info("email.sent", provider=self.provider_name, to=to, subject=subject)
