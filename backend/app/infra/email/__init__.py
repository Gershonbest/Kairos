"""Outbound email package — provider-agnostic facade for the app."""

from app.infra.email.base import BaseEmailService, EmailAttachment, EmailDeliveryError
from app.infra.email.brevo import BrevoEmailService
from app.infra.email.factory import CascadingEmailService, build_email_service
from app.infra.email.google import GoogleEmailService
from app.infra.email.smtp import SmtpEmailService

email_service: BaseEmailService = build_email_service()

__all__ = [
    "BaseEmailService",
    "BrevoEmailService",
    "CascadingEmailService",
    "EmailAttachment",
    "EmailDeliveryError",
    "GoogleEmailService",
    "SmtpEmailService",
    "build_email_service",
    "email_service",
]
