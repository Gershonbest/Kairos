"""Orheo branded email layout tests."""

from app.modules.notifications.email_layout import wrap_email_html
from app.modules.clients.email_templates import wrap_client_email_html


def test_wrap_email_html_includes_orheo_logo_and_card() -> None:
    html = wrap_email_html(inner_html="<p>Hello</p>", preheader="Hello from Orheo")
    assert "orheo-logo.png" in html
    assert "Orheo Bookings" in html
    assert "Hello from Orheo" in html
    assert "<p>Hello</p>" in html
    assert "border-radius:16px" in html


def test_wrap_client_email_html_escapes_content_and_brands() -> None:
    html = wrap_client_email_html(business_name="Bliss & Co", body="Hi <you>\n\nThanks")
    assert "&amp;" in html
    assert "&lt;you&gt;" in html
    assert "orheo-logo.png" in html
