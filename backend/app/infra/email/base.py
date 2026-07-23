"""Shared email types and abstract provider interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import structlog

from app.core.config import get_settings

logger = structlog.get_logger()


class EmailDeliveryError(Exception):
    """Raised when an outbound email could not be delivered."""


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content: bytes
    content_type: str


class BaseEmailService(ABC):
    """
    Provider contract for outbound email.

    Implement a subclass and register it in ``factory.build_email_service``
    to add another delivery backend (SendGrid, SES, Mailgun, etc.).
    """

    provider_name: str = "base"

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True when this provider has enough credentials to send."""

    @abstractmethod
    def send(
        self,
        *,
        to: str,
        subject: str,
        html_body: str,
        text_body: str | None = None,
        attachments: list[EmailAttachment] | None = None,
    ) -> None:
        """Deliver one email. Raise EmailDeliveryError on failure."""

    def log_config_status(self) -> None:
        """Optional startup diagnostics for this provider."""

    @staticmethod
    def html_to_plain(html: str) -> str:
        return (
            html.replace("<br>", "\n")
            .replace("<br/>", "\n")
            .replace("<br />", "\n")
            .replace("</p>", "\n\n")
            .replace("<p>", "")
            .replace("<strong>", "")
            .replace("</strong>", "")
        )

    def log_dev_fallback(
        self,
        *,
        to: str,
        subject: str,
        text_body: str,
        error: Exception | None = None,
    ) -> None:
        settings = get_settings()
        if settings.app_env != "dev":
            return
        logger.info(
            "email.dev_fallback",
            provider=self.provider_name,
            to=to,
            subject=subject,
            text_body=text_body,
            error=str(error) if error else None,
        )
