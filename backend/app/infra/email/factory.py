"""Email service factory and cascading provider selection."""

from __future__ import annotations

import structlog

from app.infra.email.base import BaseEmailService, EmailAttachment, EmailDeliveryError
from app.infra.email.brevo import BrevoEmailService
from app.infra.email.google import GoogleEmailService
from app.infra.email.smtp import SmtpEmailService

logger = structlog.get_logger()


class CascadingEmailService(BaseEmailService):
    """
    Try providers in priority order.

    Uses the first configured provider. On delivery failure, tries the next
    configured provider so a bad Gmail password can still fall back to SMTP.
    """

    provider_name = "cascading"

    def __init__(self, providers: list[BaseEmailService]):
        self.providers = providers

    def is_configured(self) -> bool:
        return any(provider.is_configured() for provider in self.providers)

    def log_config_status(self) -> None:
        for provider in self.providers:
            provider.log_config_status()

    def send(
        self,
        *,
        to: str,
        subject: str,
        html_body: str,
        text_body: str | None = None,
        attachments: list[EmailAttachment] | None = None,
    ) -> None:
        plain = text_body or self.html_to_plain(html_body)
        last_error: Exception | None = None
        for provider in self.providers:
            if not provider.is_configured():
                continue
            try:
                provider.send(
                    to=to,
                    subject=subject,
                    html_body=html_body,
                    text_body=plain,
                    attachments=attachments,
                )
                return
            except EmailDeliveryError as exc:
                last_error = exc
                logger.warning(
                    "email.provider_failed_trying_next",
                    provider=provider.provider_name,
                    error=str(exc),
                )

        if last_error is not None:
            raise last_error

        self.log_dev_fallback(to=to, subject=subject, text_body=plain)
        logger.info("email.skipped", reason="no_provider_configured", to=to, subject=subject)


def build_email_service(
    providers: list[BaseEmailService] | None = None,
) -> BaseEmailService:
    """
    Build the app email service.

    Default priority: Brevo HTTP API → Google Gmail → SMTP.
    Pass a custom ``providers`` list to change order or add backends.
    """
    return CascadingEmailService(
        providers
        or [
            BrevoEmailService(),
            GoogleEmailService(),
            SmtpEmailService(),
        ]
    )
