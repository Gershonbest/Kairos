"""Email delivery via Brevo API (preferred) or SMTP relay."""

from __future__ import annotations

import smtplib
import ssl
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx
import structlog

from app.core.config import get_settings

logger = structlog.get_logger()

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
BREVO_HTTP_KEY_PREFIX = "xkeysib-"
BREVO_SMTP_KEY_PREFIX = "xsmtpsib-"


def log_email_config_status() -> None:
    """Warn at startup when Brevo credentials are misconfigured."""
    settings = get_settings()
    api_key = (settings.brevo_api_key or "").strip()
    if api_key.startswith(BREVO_SMTP_KEY_PREFIX):
        logger.warning(
            "email.config_invalid",
            detail="BREVO_API_KEY contains an SMTP key (xsmtpsib-). "
            "Create an API key (xkeysib-) at https://my.brevo.com/account/settings "
            "or leave BREVO_API_KEY empty to use SMTP only.",
        )
    elif api_key and not api_key.startswith(BREVO_HTTP_KEY_PREFIX):
        logger.warning(
            "email.config_invalid",
            detail="BREVO_API_KEY should start with xkeysib-.",
        )
    if not api_key and settings.smtp_host:
        logger.info(
            "email.config",
            provider="smtp",
            host=settings.smtp_host,
            from_email=settings.smtp_from_email,
        )
    elif api_key.startswith(BREVO_HTTP_KEY_PREFIX):
        logger.info("email.config", provider="brevo_api", from_email=settings.smtp_from_email)


class EmailDeliveryError(Exception):
    """Raised when an outbound email could not be delivered."""


def _brevo_http_api_key() -> str | None:
    key = (get_settings().brevo_api_key or "").strip()
    if not key.startswith(BREVO_HTTP_KEY_PREFIX):
        return None
    return key


def send_email(*, to: str, subject: str, html_body: str, text_body: str | None = None) -> None:
    settings = get_settings()
    plain = text_body or _html_to_plain(html_body)
    api_key = _brevo_http_api_key()

    if api_key:
        try:
            _send_via_brevo_api(
                api_key=api_key,
                to=to,
                subject=subject,
                html_body=html_body,
                text_body=plain,
            )
            logger.info("email.sent", provider="brevo_api", to=to, subject=subject)
            return
        except Exception as exc:
            logger.exception("email.brevo_api_failed", to=to, subject=subject)
            if not settings.smtp_host:
                _log_dev_fallback(to=to, subject=subject, text_body=plain, error=exc)
                raise EmailDeliveryError("Unable to send email via Brevo API") from exc

    if not settings.smtp_host:
        _log_dev_fallback(to=to, subject=subject, text_body=plain)
        return

    try:
        _send_via_smtp(to=to, subject=subject, html_body=html_body, text_body=plain)
        logger.info("email.sent", provider="smtp", to=to, subject=subject)
    except Exception as exc:
        logger.exception("email.smtp_failed", to=to, subject=subject)
        _log_dev_fallback(to=to, subject=subject, text_body=plain, error=exc)
        raise EmailDeliveryError("Unable to send email via SMTP") from exc


def _send_via_brevo_api(
    *,
    api_key: str,
    to: str,
    subject: str,
    html_body: str,
    text_body: str,
) -> None:
    settings = get_settings()
    payload = {
        "sender": {"name": settings.smtp_from_name, "email": settings.smtp_from_email},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html_body,
        "textContent": text_body,
    }
    response = httpx.post(
        BREVO_API_URL,
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


def _smtp_password() -> str | None:
    settings = get_settings()
    if settings.smtp_password:
        return settings.smtp_password
    api_key = (settings.brevo_api_key or "").strip()
    if api_key.startswith(BREVO_SMTP_KEY_PREFIX):
        return api_key
    return None


def _send_via_smtp(*, to: str, subject: str, html_body: str, text_body: str) -> None:
    settings = get_settings()
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to
    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))

    attempts: list[tuple[int, bool, bool]] = []
    if settings.smtp_use_ssl:
        attempts.append((settings.smtp_port, True, False))
    if settings.smtp_use_tls:
        attempts.append((settings.smtp_port, False, True))
    for port, use_ssl, use_tls in ((587, False, True), (2525, False, True), (465, True, False)):
        candidate = (port, use_ssl, use_tls)
        if candidate not in attempts:
            attempts.append(candidate)

    last_error: Exception | None = None
    for port, use_ssl, use_tls in attempts:
        for attempt in range(1, 3):
            try:
                _smtp_send(message=message, to=to, port=port, use_ssl=use_ssl, use_tls=use_tls)
                logger.info("email.smtp_connected", port=port, use_ssl=use_ssl, use_tls=use_tls)
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


def _smtp_send(
    *,
    message: MIMEMultipart,
    to: str,
    port: int,
    use_ssl: bool,
    use_tls: bool,
) -> None:
    settings = get_settings()
    context = ssl.create_default_context()
    timeout = settings.smtp_timeout
    password = _smtp_password()

    if use_ssl:
        with smtplib.SMTP_SSL(
            settings.smtp_host,
            port,
            timeout=timeout,
            context=context,
        ) as smtp:
            smtp.ehlo()
            if settings.smtp_username and password:
                smtp.login(settings.smtp_username, password)
            smtp.sendmail(settings.smtp_from_email, [to], message.as_string())
        return

    with smtplib.SMTP(settings.smtp_host, port, timeout=timeout) as smtp:
        smtp.ehlo()
        if use_tls:
            smtp.starttls(context=context)
            smtp.ehlo()
        if settings.smtp_username and password:
            smtp.login(settings.smtp_username, password)
        smtp.sendmail(settings.smtp_from_email, [to], message.as_string())


def _log_dev_fallback(
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
        to=to,
        subject=subject,
        text_body=text_body,
        error=str(error) if error else None,
    )


def _html_to_plain(html: str) -> str:
    return (
        html.replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</p>", "\n\n")
        .replace("<p>", "")
        .replace("<strong>", "")
        .replace("</strong>", "")
    )
