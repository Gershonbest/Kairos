"""Booking + payment receipt HTML/text for email and download."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from html import escape


@dataclass(frozen=True)
class BookingReceiptData:
    booking_id: str
    client_name: str
    client_email: str
    business_name: str
    business_logo_url: str | None
    business_contact_email: str | None
    service_name: str
    start_at: datetime
    end_at: datetime
    is_all_day: bool
    appointment_format: str
    location: str | None
    host_name: str | None
    host_title: str | None
    client_instructions: str | None
    online_meeting_link: str | None
    amount_paid: float | None
    currency: str
    payment_reference: str | None
    payment_status: str | None
    paid_at: datetime | None
    service_price: float | None
    service_deposit: float | None


def _format_money(amount: float | None, currency: str = "NGN") -> str:
    if amount is None:
        return "—"
    symbol = "₦" if currency.upper() == "NGN" else f"{currency} "
    return f"{symbol}{float(amount):,.2f}"


def _when_label(data: BookingReceiptData) -> str:
    if data.is_all_day:
        return data.start_at.strftime("%A, %B %d, %Y (all day)")
    return (
        f"{data.start_at.strftime('%A, %B %d, %Y at %I:%M %p UTC')} – "
        f"{data.end_at.strftime('%I:%M %p UTC')}"
    )


def _format_label(appointment_format: str) -> str:
    return "Online" if appointment_format == "online" else "In person"


def _host_label(data: BookingReceiptData) -> str | None:
    if not data.host_name:
        return None
    if data.host_title:
        return f"{data.host_name} ({data.host_title})"
    return data.host_name


def build_receipt_plain_text(data: BookingReceiptData) -> str:
    lines = [
        f"Receipt — {data.business_name}",
        "",
        f"Hi {data.client_name},",
        "",
        "Here is your booking and payment receipt.",
        "",
        f"Business: {data.business_name}",
        f"Service: {data.service_name}",
        f"Format: {_format_label(data.appointment_format)}",
        f"When: {_when_label(data)}",
    ]
    host = _host_label(data)
    if host:
        lines.append(f"You'll meet: {host}")
    if data.location:
        lines.append(f"Location: {data.location}")
    if data.online_meeting_link:
        lines.append(f"Join link: {data.online_meeting_link}")
    if data.client_instructions:
        lines.append(f"Before your visit: {data.client_instructions}")
    lines.extend(
        [
            f"Booking reference: {data.booking_id}",
            "",
            "Payment",
            f"Amount paid: {_format_money(data.amount_paid, data.currency)}",
        ]
    )
    if data.service_deposit and data.service_price and data.service_deposit < data.service_price:
        balance = float(data.service_price) - float(data.service_deposit)
        lines.append(f"Balance due at appointment: {_format_money(balance, data.currency)}")
    if data.payment_reference:
        lines.append(f"Payment reference: {data.payment_reference}")
    if data.paid_at:
        lines.append(f"Paid at: {data.paid_at.strftime('%Y-%m-%d %H:%M UTC')}")
    if data.payment_status:
        lines.append(f"Status: {data.payment_status}")
    lines.extend(
        [
            "",
            f"Paid to: {data.business_name}",
            "Keep this receipt for your records. You can also cross-check the payment reference "
            "with any Paystack confirmation email you received.",
            "",
        ]
    )
    if data.business_contact_email:
        lines.append(f"Questions? Contact {data.business_name} at {data.business_contact_email}.")
    else:
        lines.append(f"Questions? Contact {data.business_name} directly.")
    lines.extend(["", "— Powered by Kairos Bookings"])
    return "\n".join(lines)


def build_receipt_html(data: BookingReceiptData, *, for_email: bool = False) -> str:
    """Build a standalone HTML receipt (download) or email-friendly fragment."""
    host = _host_label(data)
    rows: list[tuple[str, str]] = [
        ("Business", data.business_name),
        ("Service", data.service_name),
        ("Format", _format_label(data.appointment_format)),
        ("When", _when_label(data)),
    ]
    if host:
        rows.append(("You'll meet", host))
    if data.location:
        rows.append(("Location", data.location))
    if data.online_meeting_link:
        rows.append(("Join link", data.online_meeting_link))
    if data.client_instructions:
        rows.append(("Before your visit", data.client_instructions))
    rows.append(("Booking reference", data.booking_id))

    payment_rows: list[tuple[str, str]] = [
        ("Amount paid", _format_money(data.amount_paid, data.currency)),
        ("Paid to", data.business_name),
    ]
    if data.service_deposit and data.service_price and data.service_deposit < data.service_price:
        balance = float(data.service_price) - float(data.service_deposit)
        payment_rows.append(("Balance due", f"{_format_money(balance, data.currency)} at appointment"))
    if data.payment_reference:
        payment_rows.append(("Payment reference", data.payment_reference))
    if data.paid_at:
        payment_rows.append(("Paid at", data.paid_at.strftime("%Y-%m-%d %H:%M UTC")))
    if data.payment_status:
        payment_rows.append(("Status", data.payment_status.capitalize()))

    def row_html(label: str, value: str) -> str:
        return (
            f'<tr><td style="padding:8px 0;color:#78716c;font-size:13px;">{escape(label)}</td>'
            f'<td style="padding:8px 0;text-align:right;font-size:13px;font-weight:600;color:#1c1917;">'
            f"{escape(value)}</td></tr>"
        )

    booking_table = "".join(row_html(label, value) for label, value in rows)
    payment_table = "".join(row_html(label, value) for label, value in payment_rows)
    logo_html = ""
    if data.business_logo_url:
        logo_html = (
            f'<img src="{escape(data.business_logo_url)}" alt="" '
            'style="width:56px;height:56px;border-radius:12px;object-fit:cover;margin-bottom:12px;" />'
        )
    contact_html = (
        f'<p style="font-size:13px;color:#78716c;">Questions? Contact '
        f"<strong>{escape(data.business_name)}</strong> at "
        f'<a href="mailto:{escape(data.business_contact_email)}">{escape(data.business_contact_email)}</a>.</p>'
        if data.business_contact_email
        else f'<p style="font-size:13px;color:#78716c;">Questions? Contact '
        f"<strong>{escape(data.business_name)}</strong> directly.</p>"
    )

    body = f"""
    {logo_html}
    <h1 style="font-size:22px;margin:0 0 6px;color:#1c1917;">Payment receipt</h1>
    <p style="margin:0 0 18px;color:#78716c;font-size:14px;">Booking confirmed with {escape(data.business_name)}</p>
    <p style="font-size:14px;color:#1c1917;">Hi {escape(data.client_name)},</p>
    <p style="font-size:14px;color:#44403c;">Here is your booking and payment receipt.</p>
    <h2 style="font-size:15px;margin:22px 0 8px;color:#1c1917;">Booking</h2>
    <table style="width:100%;border-collapse:collapse;">{booking_table}</table>
    <h2 style="font-size:15px;margin:22px 0 8px;color:#1c1917;">Payment</h2>
    <table style="width:100%;border-collapse:collapse;">{payment_table}</table>
    <p style="font-size:12px;color:#a8a29e;margin-top:18px;line-height:1.5;">
      Keep this receipt for your records. You can cross-check the payment reference with any
      Paystack confirmation email you may also receive.
    </p>
    {contact_html}
    <p style="font-size:12px;color:#a8a29e;margin-top:16px;">— Powered by Kairos Bookings</p>
    """

    if for_email:
        return body.strip()

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Receipt — {escape(data.business_name)}</title>
  <style>
    body {{ font-family: Georgia, 'Times New Roman', serif; background:#f5f5f4; margin:0; padding:32px 16px; color:#1c1917; }}
    .card {{ max-width:560px; margin:0 auto; background:#fff; border:1px solid #e7e5e4; border-radius:16px; padding:28px; }}
    @media print {{
      body {{ background:#fff; padding:0; }}
      .card {{ border:none; box-shadow:none; }}
      .no-print {{ display:none; }}
    }}
  </style>
</head>
<body>
  <div class="card">
    {body}
    <p class="no-print" style="font-size:12px;color:#a8a29e;margin-top:24px;">
      Tip: use your browser’s Print → Save as PDF to keep a PDF copy.
    </p>
  </div>
</body>
</html>
"""
