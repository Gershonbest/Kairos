"""Client email template rendering tests."""

from app.modules.clients.email_templates import (
    build_template_context,
    render_template_text,
    system_template_id,
    wrap_client_email_html,
)
from app.infra.models import Client, Tenant


def test_render_system_template_placeholders() -> None:
    tenant = Tenant(id="t1", name="Bliss Spa", help_email="hello@bliss.test", public_slug="bliss-spa")
    client = Client(
        id="c1",
        tenant_id="t1",
        full_name="Ada Lovelace",
        first_name="Ada",
        last_name="Lovelace",
        email="ada@example.com",
    )
    context = build_template_context(tenant=tenant, client=client)
    subject = render_template_text("Hello {client_name}", context)
    body = render_template_text("Book here: {booking_link}", context)
    assert subject == "Hello Ada Lovelace"
    assert body.endswith("/bliss-spa")
    assert system_template_id("thank_you").startswith("system:")


def test_wrap_client_email_html_escapes_content() -> None:
    html = wrap_client_email_html(business_name="Bliss & Co", body="Hi <you>\n\nThanks")
    assert "&amp;" in html
    assert "&lt;you&gt;" in html
