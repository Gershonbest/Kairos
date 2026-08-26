"""Built-in and tenant client email templates."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.config import get_settings
from app.infra.models import Client, Tenant
from app.modules.notifications.email_layout import plain_text_to_html, wrap_email_html

SYSTEM_TEMPLATE_PREFIX = "system:"

PLACEHOLDER_HINT = "{client_name}, {business_name}, {help_email}, {booking_link}"


@dataclass(frozen=True)
class EmailTemplateDefinition:
    key: str
    name: str
    subject: str
    body: str


SYSTEM_TEMPLATES: tuple[EmailTemplateDefinition, ...] = (
    EmailTemplateDefinition(
        key="follow_up",
        name="Follow-up after visit",
        subject="How was your visit with {business_name}?",
        body=(
            "Hi {client_name},\n\n"
            "Thank you for choosing {business_name}. We hope your recent visit went well.\n\n"
            "If you have feedback or questions, reply to this email or contact us at {help_email}.\n\n"
            "We look forward to seeing you again soon."
        ),
    ),
    EmailTemplateDefinition(
        key="thank_you",
        name="Thank you",
        subject="Thank you from {business_name}",
        body=(
            "Hi {client_name},\n\n"
            "Thank you for being a valued client of {business_name}. We truly appreciate your trust.\n\n"
            "Warm regards,\n{business_name}"
        ),
    ),
    EmailTemplateDefinition(
        key="rebook",
        name="Rebook invitation",
        subject="Book your next appointment with {business_name}",
        body=(
            "Hi {client_name},\n\n"
            "It is time to schedule your next visit with {business_name}.\n\n"
            "Pick a time that works for you: {booking_link}\n\n"
            "Questions? Reach us at {help_email}."
        ),
    ),
    EmailTemplateDefinition(
        key="appointment_reminder",
        name="Appointment reminder",
        subject="Reminder from {business_name}",
        body=(
            "Hi {client_name},\n\n"
            "This is a friendly reminder about your upcoming appointment with {business_name}.\n\n"
            "If you need to reschedule, reply to this email or contact us at {help_email}.\n\n"
            "See you soon!"
        ),
    ),
    EmailTemplateDefinition(
        key="special_offer",
        name="Special offer",
        subject="A special offer for you from {business_name}",
        body=(
            "Hi {client_name},\n\n"
            "We wanted to share a special offer with you as one of our valued clients.\n\n"
            "Book online anytime: {booking_link}\n\n"
            "For details, contact us at {help_email}."
        ),
    ),
)

SYSTEM_TEMPLATE_BY_KEY = {item.key: item for item in SYSTEM_TEMPLATES}


def system_template_id(key: str) -> str:
    return f"{SYSTEM_TEMPLATE_PREFIX}{key}"


def is_system_template_id(template_id: str) -> bool:
    return template_id.startswith(SYSTEM_TEMPLATE_PREFIX)


def parse_system_template_key(template_id: str) -> str | None:
    if not is_system_template_id(template_id):
        return None
    return template_id.removeprefix(SYSTEM_TEMPLATE_PREFIX)


def booking_link_for_tenant(tenant: Tenant) -> str:
    settings = get_settings()
    tenant_key = tenant.public_slug or tenant.id
    return f"{settings.public_booking_base_url.rstrip('/')}/{tenant_key}"


def build_template_context(*, tenant: Tenant, client: Client) -> dict[str, str]:
    help_email = tenant.help_email or "our team"
    return {
        "client_name": client.full_name,
        "business_name": tenant.name,
        "help_email": help_email,
        "booking_link": booking_link_for_tenant(tenant),
    }


def render_template_text(template: str, context: dict[str, str]) -> str:
    rendered = template
    for key, value in context.items():
        rendered = rendered.replace(f"{{{key}}}", value)
    return rendered


def wrap_client_email_html(
    *,
    business_name: str,
    body: str,
    business_logo_url: str | None = None,
) -> str:
    return wrap_email_html(
        inner_html=plain_text_to_html(body),
        preheader=business_name,
        business_logo_url=business_logo_url,
    )
