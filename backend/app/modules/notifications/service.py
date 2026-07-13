"""Transactional email templates for verification and bookings."""

from datetime import datetime

import structlog

from app.infra.email import send_email

logger = structlog.get_logger()


def send_tenant_verification_email(*, to: str, full_name: str, verify_url: str) -> None:
    subject = "Confirm your Kairos Bookings account"
    html = f"""
    <p>Hi {full_name},</p>
    <p>Thanks for signing up for Kairos Bookings. Please confirm your email address to activate your account.</p>
    <p><a href="{verify_url}">Confirm email address</a></p>
    <p>If the button does not work, copy and paste this link into your browser:</p>
    <p>{verify_url}</p>
    <p>This link expires in 24 hours.</p>
    <p>— Kairos Bookings</p>
    """
    text = (
        f"Hi {full_name},\n\n"
        "Thanks for signing up for Kairos Bookings. Confirm your email to activate your account:\n"
        f"{verify_url}\n\n"
        "This link expires in 24 hours.\n\n"
        "— Kairos Bookings"
    )
    try:
        send_email(to=to, subject=subject, html_body=html, text_body=text)
    except Exception:
        logger.exception("notifications.verification_email_failed", to=to)


def send_booking_confirmation_email(
    *,
    to: str,
    client_name: str,
    business_name: str,
    service_name: str,
    start_at: datetime,
    end_at: datetime,
    location: str | None,
    host_name: str | None,
    host_title: str | None,
    appointment_format: str,
    client_instructions: str | None,
    online_meeting_link: str | None,
    booking_id: str,
) -> None:
    when = start_at.strftime("%A, %B %d, %Y at %I:%M %p UTC")
    until = end_at.strftime("%I:%M %p UTC")
    format_label = "Online" if appointment_format == "online" else "In person"
    host_line = ""
    host_text = ""
    if host_name:
        host_line = f"<p><strong>You'll meet with:</strong> {host_name}"
        if host_title:
            host_line += f" ({host_title})"
        host_line += "</p>"
        host_text = f"You'll meet with: {host_name}"
        if host_title:
            host_text += f" ({host_title})"
        host_text += "\n"

    location_line = f"<p><strong>Location:</strong> {location}</p>" if location else ""
    location_text = f"Location: {location}\n" if location else ""
    link_line = f"<p><strong>Join link:</strong> <a href=\"{online_meeting_link}\">{online_meeting_link}</a></p>" if online_meeting_link else ""
    link_text = f"Join link: {online_meeting_link}\n" if online_meeting_link else ""
    instructions_line = f"<p><strong>Before your visit:</strong> {client_instructions}</p>" if client_instructions else ""
    instructions_text = f"Before your visit: {client_instructions}\n" if client_instructions else ""

    subject = f"Booking confirmed — {service_name} with {business_name}"
    html = f"""
    <p>Hi {client_name},</p>
    <p>Your appointment is confirmed.</p>
    <p><strong>Service:</strong> {service_name}</p>
    <p><strong>Business:</strong> {business_name}</p>
    <p><strong>Format:</strong> {format_label}</p>
    <p><strong>When:</strong> {when} – {until}</p>
    {host_line}
    {location_line}
    {link_line}
    {instructions_line}
    <p><strong>Reference:</strong> {booking_id}</p>
    <p>If you need to make changes, please contact {business_name} directly.</p>
    <p>— Kairos Bookings</p>
    """
    text = (
        f"Hi {client_name},\n\n"
        "Your appointment is confirmed.\n\n"
        f"Service: {service_name}\n"
        f"Business: {business_name}\n"
        f"Format: {format_label}\n"
        f"When: {when} – {until}\n"
        f"{host_text}"
        f"{location_text}"
        f"{link_text}"
        f"{instructions_text}"
        f"Reference: {booking_id}\n\n"
        f"If you need to make changes, please contact {business_name} directly.\n\n"
        "— Kairos Bookings"
    )
    send_email(to=to, subject=subject, html_body=html, text_body=text)


def send_trial_ending_email(
    *,
    to: str,
    full_name: str,
    business_name: str,
    days_remaining: int,
    choose_plan_url: str,
) -> None:
    day_label = "day" if days_remaining == 1 else "days"
    subject = f"Your Kairos trial ends in {days_remaining} {day_label}"
    html = f"""
    <p>Hi {full_name},</p>
    <p>Your free trial for <strong>{business_name}</strong> ends in <strong>{days_remaining} {day_label}</strong>.</p>
    <p>Choose a plan now to keep your bookings, clients, and dashboard access without interruption.</p>
    <p><a href="{choose_plan_url}">Choose a plan</a></p>
    <p>If the button does not work, copy and paste this link into your browser:</p>
    <p>{choose_plan_url}</p>
    <p>— Kairos Bookings</p>
    """
    text = (
        f"Hi {full_name},\n\n"
        f"Your free trial for {business_name} ends in {days_remaining} {day_label}.\n"
        "Choose a plan to keep your account active:\n"
        f"{choose_plan_url}\n\n"
        "— Kairos Bookings"
    )
    try:
        send_email(to=to, subject=subject, html_body=html, text_body=text)
    except Exception:
        logger.exception("notifications.trial_ending_email_failed", to=to)
