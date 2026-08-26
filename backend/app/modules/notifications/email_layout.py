"""Shared Orheo email chrome matching the designed receipt card."""

from __future__ import annotations

from html import escape

from app.core.config import get_settings

INK = "#1c1917"
MUTED = "#78716c"
FAINT = "#a8a29e"
BODY_BG = "#f5f5f4"
CARD_BORDER = "#e7e5e4"


def orheo_logo_url() -> str:
    return f"{get_settings().frontend_base_url.rstrip('/')}/orheo-logo.png"


def email_h1(text: str) -> str:
    return (
        f'<h1 style="font-size:22px;margin:0 0 8px;color:{INK};'
        f'font-family:Georgia,\'Times New Roman\',serif;">{escape(text)}</h1>'
    )


def email_p(text: str, *, muted: bool = False) -> str:
    color = MUTED if muted else "#44403c"
    return (
        f'<p style="font-size:14px;line-height:1.55;color:{color};margin:0 0 14px;">'
        f"{escape(text)}</p>"
    )


def email_button(href: str, label: str) -> str:
    return (
        '<p style="margin:20px 0 18px;">'
        f'<a href="{escape(href)}" style="display:inline-block;background:{INK};color:#ffffff;'
        "text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;"
        f'font-weight:600;font-family:system-ui,-apple-system,sans-serif;">{escape(label)}</a>'
        "</p>"
    )


def plain_text_to_html(body: str) -> str:
    blocks: list[str] = []
    for block in body.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        inner = "<br>".join(escape(line) for line in block.split("\n"))
        blocks.append(
            f'<p style="margin:0 0 14px;line-height:1.55;color:{INK};font-size:14px;">{inner}</p>'
        )
    return "\n".join(blocks)


def wrap_email_html(
    *,
    inner_html: str,
    preheader: str = "",
    business_logo_url: str | None = None,
) -> str:
    """Wrap inner HTML in the receipt-style Orheo card."""
    hidden = ""
    if preheader:
        hidden = (
            '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">'
            f"{escape(preheader)}</div>"
        )
    business_logo = ""
    if business_logo_url:
        business_logo = (
            f'<img src="{escape(business_logo_url)}" alt="" width="48" height="48" '
            'style="width:48px;height:48px;border-radius:12px;object-fit:cover;display:block;" />'
        )
    logo = escape(orheo_logo_url())
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @media print {{
      body {{ background:#fff !important; }}
      .no-print {{ display:none !important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:{BODY_BG};">
  {hidden}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{BODY_BG};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid {CARD_BORDER};border-radius:16px;">
          <tr>
            <td style="padding:28px;font-family:Georgia,'Times New Roman',serif;color:{INK};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:22px;">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="{logo}" alt="Orheo" width="40" height="40" style="width:40px;height:40px;border-radius:10px;display:block;background:#0f172a;" />
                    <p style="margin:10px 0 0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:{MUTED};font-family:system-ui,-apple-system,sans-serif;">Orheo Bookings</p>
                  </td>
                  <td align="right" style="vertical-align:middle;">{business_logo}</td>
                </tr>
              </table>
              {inner_html}
              <p style="margin:24px 0 0;font-size:12px;color:{FAINT};">Powered by Orheo Bookings</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
