"""Paystack customer name/phone propagation tests."""

from types import SimpleNamespace

import pytest

from app.infra.paystack import PaystackClient
from app.modules.subscriptions.service import _tenant_phone


def test_split_full_name_handles_single_and_multi_word() -> None:
    assert PaystackClient.split_full_name("Gershon Okoro") == ("Gershon", "Okoro")
    assert PaystackClient.split_full_name("Gershon") == ("Gershon", None)
    assert PaystackClient.split_full_name("Ada Grace Obi") == ("Ada", "Grace Obi")
    assert PaystackClient.split_full_name(None) == (None, None)


def test_tenant_phone_joins_dial_code_without_leading_zero() -> None:
    tenant = SimpleNamespace(phone_country_code="+234", phone_number="08012345678")
    assert _tenant_phone(tenant) == "+2348012345678"


def test_tenant_phone_returns_none_without_number() -> None:
    assert _tenant_phone(SimpleNamespace(phone_country_code="+234", phone_number="")) is None


@pytest.mark.asyncio
async def test_initialize_transaction_sends_customer_details(monkeypatch) -> None:
    client = PaystackClient()
    calls: list[tuple[str, str, dict | None]] = []

    async def fake_request(method: str, path: str, *, json: dict | None = None):
        calls.append((method, path, json))
        if path == "/customer":
            return {"customer_code": "CUS_1", "first_name": None, "last_name": None, "phone": None}
        if path.startswith("/customer/"):
            return {"customer_code": "CUS_1", "first_name": "Ada", "last_name": "Obi", "phone": "+2348012345678"}
        return {"reference": "ref_1", "authorization_url": "https://pay", "access_code": "acc"}

    monkeypatch.setattr(client, "_request", fake_request)

    await client.initialize_transaction(
        email="ada@example.com",
        amount_naira=5000,
        reference="ref_1",
        callback_url="https://app.test/callback",
        metadata={"purpose": "booking"},
        customer_name="Ada Obi",
        customer_phone="+2348012345678",
    )

    create_call = next(call for call in calls if call[1] == "/customer")
    assert create_call[2] == {
        "email": "ada@example.com",
        "first_name": "Ada",
        "last_name": "Obi",
        "phone": "+2348012345678",
    }

    # Existing customers come back unchanged, so an update must follow.
    assert any(call[0] == "PUT" and call[1] == "/customer/CUS_1" for call in calls)

    init_call = next(call for call in calls if call[1] == "/transaction/initialize")
    custom_fields = init_call[2]["metadata"]["custom_fields"]
    assert {"display_name": "Customer Name", "variable_name": "customer_name", "value": "Ada Obi"} in custom_fields
    assert init_call[2]["metadata"]["purpose"] == "booking"


@pytest.mark.asyncio
async def test_checkout_still_works_when_customer_api_fails(monkeypatch) -> None:
    from app.infra.paystack import PaystackError

    client = PaystackClient()

    async def fake_request(method: str, path: str, *, json: dict | None = None):
        if path.startswith("/customer"):
            raise PaystackError("customer rejected")
        return {"reference": "ref_2", "authorization_url": "https://pay", "access_code": "acc"}

    monkeypatch.setattr(client, "_request", fake_request)

    data = await client.initialize_transaction(
        email="ada@example.com",
        amount_naira=5000,
        reference="ref_2",
        callback_url="https://app.test/callback",
        customer_name="Ada Obi",
        customer_phone="+2348012345678",
    )
    assert data["reference"] == "ref_2"
