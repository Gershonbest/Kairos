"""Transactional email templates and in-app notification helpers."""

from __future__ import annotations

import asyncio
from datetime import datetime
from html import escape

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.calendar_ics import CalendarEventArgs, calendar_invite_service
from app.infra.cache import redis_cache
from app.infra.email import EmailAttachment, email_service
from app.core.config import get_settings
from app.infra.models import (
    Booking,
    Client,
    Notification,
    NotificationType,
    PaymentTransaction,
    Service,
    Tenant,
    User,
    UserRole,
)
from app.modules.notifications.receipt import (
    BookingReceiptData,
    build_receipt_html,
    build_receipt_plain_text,
)

logger = structlog.get_logger()


def send_subscription_payment_receipt_email(
    *,
    to: str,
    customer_name: str,
    business_name: str,
    plan_name: str,
    amount: float,
    currency: str,
    payment_reference: str,
    paid_at: datetime | None,
    paid_until: datetime | None,
) -> bool:
    """Send a subscription payment receipt and report delivery success."""
    symbol = "₦" if currency.upper() == "NGN" else f"{currency.upper()} "
    amount_label = f"{symbol}{amount:,.2f}"
    paid_at_label = paid_at.strftime("%Y-%m-%d %H:%M UTC") if paid_at else "—"
    paid_until_label = paid_until.strftime("%Y-%m-%d") if paid_until else "—"
    subject = f"Payment receipt — {plan_name} plan"
    html = f"""
    <h1 style="font-size:22px;color:#1c1917;">Payment receipt</h1>
    <p>Hi {escape(customer_name)},</p>
    <p>Your Orheo Bookings subscription payment was successful.</p>
    <table style="width:100%;max-width:520px;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#78716c;">Business</td><td style="text-align:right;font-weight:600;">{escape(business_name)}</td></tr>
      <tr><td style="padding:8px 0;color:#78716c;">Plan</td><td style="text-align:right;font-weight:600;">{escape(plan_name)}</td></tr>
      <tr><td style="padding:8px 0;color:#78716c;">Amount paid</td><td style="text-align:right;font-weight:600;">{escape(amount_label)}</td></tr>
      <tr><td style="padding:8px 0;color:#78716c;">Payment reference</td><td style="text-align:right;font-weight:600;">{escape(payment_reference)}</td></tr>
      <tr><td style="padding:8px 0;color:#78716c;">Paid at</td><td style="text-align:right;font-weight:600;">{paid_at_label}</td></tr>
      <tr><td style="padding:8px 0;color:#78716c;">Access paid until</td><td style="text-align:right;font-weight:600;">{paid_until_label}</td></tr>
      <tr><td style="padding:8px 0;color:#78716c;">Status</td><td style="text-align:right;font-weight:600;">Succeeded</td></tr>
    </table>
    <p style="color:#78716c;font-size:13px;">Keep this receipt for your records.</p>
    <p>— Orheo Bookings</p>
    """
    text = (
        f"Payment receipt\n\nHi {customer_name},\n\n"
        "Your Orheo Bookings subscription payment was successful.\n\n"
        f"Business: {business_name}\n"
        f"Plan: {plan_name}\n"
        f"Amount paid: {amount_label}\n"
        f"Payment reference: {payment_reference}\n"
        f"Paid at: {paid_at_label}\n"
        f"Access paid until: {paid_until_label}\n"
        "Status: Succeeded\n\n"
        "Keep this receipt for your records.\n\n— Orheo Bookings"
    )
    try:
        email_service.send(to=to, subject=subject, html_body=html, text_body=text)
        return True
    except Exception:
        logger.exception(
            "notifications.subscription_receipt_failed",
            to=to,
            payment_reference=payment_reference,
        )
        return False


async def send_subscription_payment_receipt_once(
    *,
    transaction_id: str,
    to: str,
    customer_name: str,
    business_name: str,
    plan_name: str,
    amount: float,
    currency: str,
    payment_reference: str,
    paid_at: datetime | None,
    paid_until: datetime | None,
) -> bool:
    """Send one receipt per transaction across callback/webhook retries."""
    marker = f"notification:subscription-receipt:{transaction_id}"
    claimed = await redis_cache.client.set(marker, "sending", nx=True, ex=60 * 60 * 24 * 90)
    if not claimed:
        return False
    sent = await asyncio.to_thread(
        send_subscription_payment_receipt_email,
        to=to,
        customer_name=customer_name,
        business_name=business_name,
        plan_name=plan_name,
        amount=amount,
        currency=currency,
        payment_reference=payment_reference,
        paid_at=paid_at,
        paid_until=paid_until,
    )
    if not sent:
        await redis_cache.client.delete(marker)
    return sent


def send_tenant_verification_email(*, to: str, full_name: str, verify_url: str) -> None:
    subject = "Confirm your Orheo Bookings account"
    html = f"""
    <p>Hi {full_name},</p>
    <p>Thanks for signing up for Orheo Bookings. Please confirm your email address to activate your account.</p>
    <p><a href="{verify_url}">Confirm email address</a></p>
    <p>If the button does not work, copy and paste this link into your browser:</p>
    <p>{verify_url}</p>
    <p>This link expires in 24 hours.</p>
    <p>— Orheo Bookings</p>
    """
    text = (
        f"Hi {full_name},\n\n"
        "Thanks for signing up for Orheo Bookings. Confirm your email to activate your account:\n"
        f"{verify_url}\n\n"
        "This link expires in 24 hours.\n\n"
        "— Orheo Bookings"
    )
    try:
        email_service.send(to=to, subject=subject, html_body=html, text_body=text)
    except Exception:
        logger.exception("notifications.verification_email_failed", to=to)


def send_password_reset_email(*, to: str, full_name: str, reset_url: str, expire_hours: int = 1) -> None:
    subject = "Reset your Orheo Bookings password"
    hour_label = "1 hour" if expire_hours == 1 else f"{expire_hours} hours"
    html = f"""
    <p>Hi {full_name},</p>
    <p>We received a request to reset the password for your Orheo Bookings account.</p>
    <p><a href="{reset_url}">Reset password</a></p>
    <p>If the button does not work, copy and paste this link into your browser:</p>
    <p>{reset_url}</p>
    <p>This link expires in {hour_label}. If you did not request a reset, you can ignore this email.</p>
    <p>— Orheo Bookings</p>
    """
    text = (
        f"Hi {full_name},\n\n"
        "We received a request to reset the password for your Orheo Bookings account.\n"
        f"Reset your password: {reset_url}\n\n"
        f"This link expires in {hour_label}. If you did not request a reset, ignore this email.\n\n"
        "— Orheo Bookings"
    )
    try:
        email_service.send(to=to, subject=subject, html_body=html, text_body=text)
        logger.info("notifications.password_reset_email_sent", to=to)
    except Exception:
        logger.exception("notifications.password_reset_email_failed", to=to)


def send_password_reset_google_hint_email(*, to: str, full_name: str) -> None:
    subject = "Sign in to Orheo Bookings with Google"
    frontend = get_settings().frontend_base_url.rstrip("/")
    login_url = f"{frontend}/auth/login"
    html = f"""
    <p>Hi {full_name},</p>
    <p>We received a password reset request for this email, but your Orheo Bookings account uses Google sign-in.</p>
    <p>There is no password to reset. Please sign in with Google instead:</p>
    <p><a href="{login_url}">Go to sign in</a></p>
    <p>If you did not request this, you can ignore this email.</p>
    <p>— Orheo Bookings</p>
    """
    text = (
        f"Hi {full_name},\n\n"
        "We received a password reset request for this email, but your Orheo Bookings account uses Google sign-in.\n"
        f"Sign in here: {login_url}\n\n"
        "If you did not request this, ignore this email.\n\n"
        "— Orheo Bookings"
    )
    try:
        email_service.send(to=to, subject=subject, html_body=html, text_body=text)
        logger.info("notifications.password_reset_google_hint_sent", to=to)
    except Exception:
        logger.exception("notifications.password_reset_google_hint_failed", to=to)


def build_booking_receipt_data(
    *,
    tenant: Tenant,
    service: Service,
    booking: Booking,
    client: Client,
    payment_tx: PaymentTransaction | None = None,
    location: str | None = None,
    business_contact_email: str | None = None,
) -> BookingReceiptData:
    appointment_format = booking.appointment_format.value if booking.appointment_format else "onsite"
    amount = float(payment_tx.amount) if payment_tx and payment_tx.amount is not None else None
    return BookingReceiptData(
        booking_id=booking.id,
        client_name=client.full_name,
        client_email=client.email,
        business_name=tenant.name,
        business_logo_url=tenant.public_logo_url,
        business_contact_email=business_contact_email,
        service_name=service.name,
        start_at=booking.start_at,
        end_at=booking.end_at,
        is_all_day=bool(booking.is_all_day),
        appointment_format=appointment_format,
        location=location,
        host_name=service.host_name,
        host_title=service.host_title,
        client_instructions=service.client_instructions,
        online_meeting_link=(
            service.online_meeting_link if appointment_format == "online" else None
        ),
        amount_paid=amount,
        currency=(payment_tx.currency if payment_tx and payment_tx.currency else "NGN"),
        payment_reference=payment_tx.provider_reference if payment_tx else None,
        payment_status=payment_tx.status.value if payment_tx else None,
        paid_at=payment_tx.paid_at if payment_tx else None,
        service_price=float(service.price_amount) if service.price_amount is not None else None,
        service_deposit=float(service.deposit_amount) if service.deposit_amount is not None else None,
    )


def send_booking_receipt_from_data(receipt: BookingReceiptData) -> None:
    """Send receipt + booking confirmation email (with ICS + HTML receipt attachments)."""
    send_booking_confirmation_email(
        to=receipt.client_email,
        client_name=receipt.client_name,
        business_name=receipt.business_name,
        service_name=receipt.service_name,
        start_at=receipt.start_at,
        end_at=receipt.end_at,
        location=receipt.location,
        host_name=receipt.host_name,
        host_title=receipt.host_title,
        appointment_format=receipt.appointment_format,
        client_instructions=receipt.client_instructions,
        online_meeting_link=receipt.online_meeting_link,
        booking_id=receipt.booking_id,
        is_all_day=receipt.is_all_day,
        business_logo_url=receipt.business_logo_url,
        business_contact_email=receipt.business_contact_email,
        amount_paid=receipt.amount_paid,
        currency=receipt.currency,
        payment_reference=receipt.payment_reference,
        payment_status=receipt.payment_status,
        paid_at=receipt.paid_at,
        service_price=receipt.service_price,
        service_deposit=receipt.service_deposit,
    )


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
    is_all_day: bool = False,
    business_logo_url: str | None = None,
    business_contact_email: str | None = None,
    amount_paid: float | None = None,
    currency: str = "NGN",
    payment_reference: str | None = None,
    payment_status: str | None = None,
    paid_at: datetime | None = None,
    service_price: float | None = None,
    service_deposit: float | None = None,
) -> None:
    receipt = BookingReceiptData(
        booking_id=booking_id,
        client_name=client_name,
        client_email=to,
        business_name=business_name,
        business_logo_url=business_logo_url,
        business_contact_email=business_contact_email,
        service_name=service_name,
        start_at=start_at,
        end_at=end_at,
        is_all_day=is_all_day,
        appointment_format=appointment_format,
        location=location,
        host_name=host_name,
        host_title=host_title,
        client_instructions=client_instructions,
        online_meeting_link=online_meeting_link,
        amount_paid=amount_paid,
        currency=currency,
        payment_reference=payment_reference,
        payment_status=payment_status,
        paid_at=paid_at,
        service_price=service_price,
        service_deposit=service_deposit,
    )
    calendar_args: CalendarEventArgs = {
        "booking_id": booking_id,
        "business_name": business_name,
        "service_name": service_name,
        "start_at": start_at,
        "end_at": end_at,
        "location": location,
        "host_name": host_name,
        "host_title": host_title,
        "appointment_format": appointment_format,
        "client_instructions": client_instructions,
        "online_meeting_link": online_meeting_link,
        "is_all_day": is_all_day,
    }
    calendar_invite = calendar_invite_service.build_booking_ics(**calendar_args)
    google_calendar_url = calendar_invite_service.build_google_calendar_url(**calendar_args)

    receipt_body = build_receipt_html(receipt, for_email=True)
    subject = f"Receipt & booking confirmed — {service_name} with {business_name}"
    html = f"""
    {receipt_body}
    <p style="font-size:14px;margin-top:18px;"><a href="{google_calendar_url}">Add to Google Calendar</a></p>
    <p style="font-size:13px;color:#78716c;">A calendar invite is attached for Apple Calendar, Outlook, and other calendar apps.</p>
    """
    text = (
        build_receipt_plain_text(receipt)
        + f"\n\nAdd to Google Calendar: {google_calendar_url}\n"
        "A calendar invite is attached for Apple Calendar, Outlook, and other calendar apps.\n"
    )
    try:
        email_service.send(
            to=to,
            subject=subject,
            html_body=html,
            text_body=text,
            attachments=[
                EmailAttachment(
                    filename=f"booking-{booking_id}.ics",
                    content=calendar_invite.encode("utf-8"),
                    content_type="text/calendar",
                ),
                EmailAttachment(
                    filename=f"receipt-{booking_id}.html",
                    content=build_receipt_html(receipt).encode("utf-8"),
                    content_type="text/html",
                ),
            ],
        )
    except Exception:
        logger.exception("notifications.booking_confirmation_email_failed", to=to, booking_id=booking_id)


def send_new_booking_owner_email(
    *,
    to: str,
    owner_name: str,
    business_name: str,
    client_name: str,
    client_email: str,
    service_name: str,
    start_at: datetime,
    end_at: datetime,
    appointment_format: str,
    booking_id: str,
) -> None:
    when = start_at.strftime("%A, %B %d, %Y at %I:%M %p UTC")
    until = end_at.strftime("%I:%M %p UTC")
    format_label = "Online" if appointment_format == "online" else "In person"
    subject = f"New booking — {service_name}"
    html = f"""
    <p>Hi {owner_name},</p>
    <p>You have a new booking for <strong>{business_name}</strong>.</p>
    <p><strong>Client:</strong> {client_name} ({client_email})</p>
    <p><strong>Service:</strong> {service_name}</p>
    <p><strong>Format:</strong> {format_label}</p>
    <p><strong>When:</strong> {when} – {until}</p>
    <p><strong>Reference:</strong> {booking_id}</p>
    <p>— Orheo Bookings</p>
    """
    text = (
        f"Hi {owner_name},\n\n"
        f"You have a new booking for {business_name}.\n\n"
        f"Client: {client_name} ({client_email})\n"
        f"Service: {service_name}\n"
        f"Format: {format_label}\n"
        f"When: {when} – {until}\n"
        f"Reference: {booking_id}\n\n"
        "— Orheo Bookings"
    )
    try:
        email_service.send(to=to, subject=subject, html_body=html, text_body=text)
    except Exception:
        logger.exception("notifications.owner_booking_email_failed", to=to, booking_id=booking_id)


async def create_booking_notifications(
    session: AsyncSession,
    *,
    tenant: Tenant,
    booking: Booking,
    client: Client,
    service: Service,
) -> User | None:
    """Insert in-app notifications for active tenant users. Returns a primary owner for email."""
    users = (
        await session.execute(
            select(User).where(
                User.tenant_id == tenant.id,
                User.is_active.is_(True),
                User.role.in_([UserRole.tenant_admin, UserRole.tenant_user]),
            )
        )
    ).scalars().all()
    if not users:
        return None

    when = booking.start_at.strftime("%A, %B %d, %Y at %I:%M %p UTC")
    title = f"New booking: {service.name}"
    body = f"{client.full_name} booked {service.name} for {when}."

    for user in users:
        session.add(
            Notification(
                tenant_id=tenant.id,
                user_id=user.id,
                type=NotificationType.booking_created,
                title=title,
                body=body,
                booking_id=booking.id,
            )
        )

    owner = next((user for user in users if user.role == UserRole.tenant_admin), users[0])
    return owner


def send_trial_ending_email(
    *,
    to: str,
    full_name: str,
    business_name: str,
    days_remaining: int,
    choose_plan_url: str,
) -> None:
    day_label = "day" if days_remaining == 1 else "days"
    subject = f"Your Orheo trial ends in {days_remaining} {day_label}"
    html = f"""
    <p>Hi {full_name},</p>
    <p>Your free trial for <strong>{business_name}</strong> ends in <strong>{days_remaining} {day_label}</strong>.</p>
    <p>Choose a plan now to keep your bookings, clients, and dashboard access without interruption.</p>
    <p><a href="{choose_plan_url}">Choose a plan</a></p>
    <p>If the button does not work, copy and paste this link into your browser:</p>
    <p>{choose_plan_url}</p>
    <p>— Orheo Bookings</p>
    """
    text = (
        f"Hi {full_name},\n\n"
        f"Your free trial for {business_name} ends in {days_remaining} {day_label}.\n"
        "Choose a plan to keep your account active:\n"
        f"{choose_plan_url}\n\n"
        "— Orheo Bookings"
    )
    try:
        email_service.send(to=to, subject=subject, html_body=html, text_body=text)
    except Exception:
        logger.exception("notifications.trial_ending_email_failed", to=to)
