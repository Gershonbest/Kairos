"""Paystack return URLs: platform (business→Orheo) vs booking (client→business)."""

from types import SimpleNamespace

from app.modules.payments import service as payment_service


def _settings(**overrides):
    base = {
        "paystack_callback_url_platform": None,
        "paystack_callback_url_booking": None,
        "paystack_callback_base_url": None,
        "frontend_base_url": "http://localhost:5173",
        "public_booking_base_url": "",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_platform_callback_uses_dedicated_url(monkeypatch):
    monkeypatch.setattr(
        payment_service,
        "settings",
        _settings(paystack_callback_url_platform="https://app.orheo.com/dashboard/choose-plan"),
    )
    url = payment_service.platform_payment_callback_url(reference="sub_abc")
    assert url == "https://app.orheo.com/dashboard/choose-plan?payment=1&reference=sub_abc"


def test_platform_callback_appends_path_when_origin_only(monkeypatch):
    monkeypatch.setattr(
        payment_service,
        "settings",
        _settings(paystack_callback_url_platform="https://app.orheo.com"),
    )
    url = payment_service.platform_payment_callback_url(reference="sub_abc")
    assert url == "https://app.orheo.com/dashboard/choose-plan?payment=1&reference=sub_abc"


def test_booking_callback_uses_dedicated_url(monkeypatch):
    monkeypatch.setattr(
        payment_service,
        "settings",
        _settings(
            paystack_callback_url_booking="https://book.orheo.com/book",
            public_booking_base_url="https://unused.example/book",
        ),
    )
    url = payment_service.booking_payment_callback_url(
        tenant_key="acme",
        booking_id="b1",
        reference="ps_ref",
    )
    assert url == "https://book.orheo.com/book/acme?payment=1&booking_id=b1&reference=ps_ref"


def test_booking_callback_falls_back_to_public_booking_base(monkeypatch):
    monkeypatch.setattr(
        payment_service,
        "settings",
        _settings(public_booking_base_url="http://localhost:5173/book"),
    )
    url = payment_service.booking_payment_callback_url(
        tenant_key="acme",
        booking_id="b1",
        reference="ps_ref",
    )
    assert url.startswith("http://localhost:5173/book/acme?")
