"""SMTP email provider (including Brevo SMTP relay keys)."""

from __future__ import annotations

import smtplib
import ssl
import time
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import structlog

from app.core.config import get_settings
from app.infra.email.base import BaseEmailService, EmailAttachment, EmailDeliveryError
from app.infra.email.brevo import BREVO_SMTP_KEY_PREFIX

logger = structlog.get_logger()


class SmtpEmailService(BaseEmailService):
    """Send mail through a configured SMTP host."""

    provider_name = "smtp"

    def __init__(self, *, smtp_key_prefix: str = BREVO_SMTP_KEY_PREFIX):
        self.smtp_key_prefix = smtp_key_prefix

    def is_configured(self) -> bool:
        return bool(get_settings().smtp_host)

    def log_config_status(self) -> None:
        settings = get_settings()
        if settings.smtp_host and not (settings.brevo_api_key or "").strip().startswith("xkeysib-"):
            logger.info(
                "email.config",
                provider=self.provider_name,
                host=settings.smtp_host,
                from_email=settings.smtp_from_email,
            )

    def _password(self) -> str | None:
        settings = get_settings()
        if settings.smtp_password:
            return settings.smtp_password
        api_key = (settings.brevo_api_key or "").strip()
        if api_key.startswith(self.smtp_key_prefix):
            return api_key
        return None

    def send(
        self,
        *,
        to: str,
        subject: str,
        html_body: str,
        text_body: str | None = None,
        attachments: list[EmailAttachment] | None = None,
    ) -> None:
        settings = get_settings()
        if not settings.smtp_host:
            raise EmailDeliveryError("SMTP host is not configured")

        plain = text_body or self.html_to_plain(html_body)
        message = MIMEMultipart("mixed")
        message["Subject"] = subject
        message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        message["To"] = to
        alternative = MIMEMultipart("alternative")
        alternative.attach(MIMEText(plain, "plain", "utf-8"))
        alternative.attach(MIMEText(html_body, "html", "utf-8"))
        message.attach(alternative)

        for attachment in attachments or []:
            maintype, subtype = attachment.content_type.split("/", 1)
            part = MIMEBase(maintype, subtype, method="REQUEST", charset="utf-8")
            part.set_payload(attachment.content)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=attachment.filename)
            message.attach(part)

        attempts: list[tuple[int, bool, bool]] = []
        if settings.smtp_use_ssl:
            attempts.append((settings.smtp_port, True, False))
        if settings.smtp_use_tls:
            attempts.append((settings.smtp_port, False, True))
        for port, use_ssl, use_tls in ((587, False, True), (2525, False, True), (465, True, False)):
            candidate = (port, use_ssl, use_tls)
            if candidate not in attempts:
                attempts.append(candidate)

        try:
            last_error: Exception | None = None
            for port, use_ssl, use_tls in attempts:
                for attempt in range(1, 3):
                    try:
                        self._smtp_send(message=message, to=to, port=port, use_ssl=use_ssl, use_tls=use_tls)
                        logger.info(
                            "email.smtp_connected",
                            port=port,
                            use_ssl=use_ssl,
                            use_tls=use_tls,
                        )
                        logger.info("email.sent", provider=self.provider_name, to=to, subject=subject)
                        return
                    except Exception as exc:
                        last_error = exc
                        logger.warning(
                            "email.smtp_retry",
                            port=port,
                            use_ssl=use_ssl,
                            use_tls=use_tls,
                            attempt=attempt,
                            error=str(exc),
                        )
                        if attempt < 2:
                            time.sleep(attempt * 2)
            assert last_error is not None
            raise last_error
        except Exception as exc:
            logger.exception("email.smtp_failed", to=to, subject=subject)
            self.log_dev_fallback(to=to, subject=subject, text_body=plain, error=exc)
            raise EmailDeliveryError("Unable to send email via SMTP") from exc

    def _smtp_send(
        self,
        *,
        message: MIMEMultipart,
        to: str,
        port: int,
        use_ssl: bool,
        use_tls: bool,
    ) -> None:
        settings = get_settings()
        host = settings.smtp_host
        if not host:
            raise EmailDeliveryError("SMTP host is not configured")
        context = ssl.create_default_context()
        timeout = settings.smtp_timeout
        password = self._password()

        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=timeout, context=context) as smtp:
                smtp.ehlo()
                if settings.smtp_username and password:
                    smtp.login(settings.smtp_username, password)
                smtp.sendmail(settings.smtp_from_email, [to], message.as_string())
            return

        with smtplib.SMTP(host, port, timeout=timeout) as smtp:
            smtp.ehlo()
            if use_tls:
                smtp.starttls(context=context)
                smtp.ehlo()
            if settings.smtp_username and password:
                smtp.login(settings.smtp_username, password)
            smtp.sendmail(settings.smtp_from_email, [to], message.as_string())
