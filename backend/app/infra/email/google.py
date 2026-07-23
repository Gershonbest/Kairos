"""Gmail SMTP email provider (Google account + app password)."""

from __future__ import annotations

import smtplib
import ssl
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

import structlog

from app.core.config import get_settings
from app.infra.email.base import BaseEmailService, EmailAttachment, EmailDeliveryError

logger = structlog.get_logger()

GMAIL_SMTP_HOST = "smtp.gmail.com"
GMAIL_SMTP_PORT = 587


class GoogleEmailService(BaseEmailService):
    """
    Send mail through Gmail SMTP using an app password.

    Same approach as a typical GmailSender: smtp.gmail.com:587 + TLS +
    Google account email + 16-character app password.
    """

    provider_name = "google_gmail"

    def __init__(
        self,
        *,
        smtp_host: str = GMAIL_SMTP_HOST,
        smtp_port: int = GMAIL_SMTP_PORT,
        timeout: int = 30,
    ):
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.timeout = timeout

    def _sender(self) -> str:
        settings = get_settings()
        return (settings.google_gmail_sender or "").strip()

    def _app_password(self) -> str:
        # Google displays app passwords as "xxxx xxxx xxxx xxxx"; SMTP expects no spaces.
        return (get_settings().google_gmail_app_password or "").replace(" ", "").strip()

    def is_configured(self) -> bool:
        return bool(self._sender() and self._app_password())

    def log_config_status(self) -> None:
        if self.is_configured():
            logger.info(
                "email.config",
                provider=self.provider_name,
                host=self.smtp_host,
                from_email=self._sender(),
            )

    def _build_message(
        self,
        *,
        to: str,
        subject: str,
        html_body: str,
        text_body: str,
        attachments: list[EmailAttachment] | None,
    ) -> MIMEMultipart:
        settings = get_settings()
        sender = self._sender()
        message = MIMEMultipart("mixed")
        message["Subject"] = subject
        message["To"] = to
        message["From"] = formataddr((settings.smtp_from_name, sender))

        alternative = MIMEMultipart("alternative")
        alternative.attach(MIMEText(text_body, "plain", "utf-8"))
        alternative.attach(MIMEText(html_body, "html", "utf-8"))
        message.attach(alternative)

        for attachment in attachments or []:
            maintype, subtype = attachment.content_type.split("/", 1)
            part = MIMEBase(maintype, subtype, method="REQUEST", charset="utf-8")
            part.set_payload(attachment.content)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=attachment.filename)
            message.attach(part)

        return message

    def send(
        self,
        *,
        to: str,
        subject: str,
        html_body: str,
        text_body: str | None = None,
        attachments: list[EmailAttachment] | None = None,
    ) -> None:
        if not self.is_configured():
            raise EmailDeliveryError("Google Gmail is not configured")

        sender = self._sender()
        password = self._app_password()
        plain = text_body or self.html_to_plain(html_body)
        message = self._build_message(
            to=to,
            subject=subject,
            html_body=html_body,
            text_body=plain,
            attachments=attachments,
        )

        try:
            context = ssl.create_default_context()
            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=self.timeout) as smtp:
                smtp.ehlo()
                smtp.starttls(context=context)
                smtp.ehlo()
                smtp.login(sender, password)
                smtp.sendmail(sender, [to], message.as_string())
        except Exception as exc:
            logger.exception("email.google_gmail_failed", to=to, subject=subject)
            self.log_dev_fallback(to=to, subject=subject, text_body=plain, error=exc)
            raise EmailDeliveryError("Unable to send email via Google Gmail") from exc

        logger.info("email.sent", provider=self.provider_name, to=to, subject=subject)
