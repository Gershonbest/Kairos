"""Payment provider adapters — Paystack is the live gateway; others remain stubs."""

from __future__ import annotations

import hashlib
import hmac
import uuid
from dataclasses import dataclass

from app.core.config import get_settings
from app.infra import paystack as paystack_client


@dataclass
class ProviderIntent:
    reference: str
    status: str
    authorization_url: str | None = None
    access_code: str | None = None


class BaseProvider:
    code: str

    async def create_intent(
        self,
        *,
        amount: float,
        booking_id: str,
        email: str,
        callback_url: str,
        metadata: dict | None = None,
        subaccount_code: str | None = None,
        reference: str | None = None,
    ) -> ProviderIntent:
        ref = reference or f"{self.code}_{booking_id}_{uuid.uuid4().hex[:10]}"
        return ProviderIntent(reference=ref, status="pending")


class StripeProvider(BaseProvider):
    code = "stripe"


class FlutterwaveProvider(BaseProvider):
    code = "flutterwave"


class PaystackProvider(BaseProvider):
    code = "paystack"

    async def create_intent(
        self,
        *,
        amount: float,
        booking_id: str,
        email: str,
        callback_url: str,
        metadata: dict | None = None,
        subaccount_code: str | None = None,
        reference: str | None = None,
    ) -> ProviderIntent:
        ref = reference or f"ps_{booking_id.replace('-', '')[:12]}_{uuid.uuid4().hex[:10]}"
        data = await paystack_client.initialize_transaction(
            email=email,
            amount_naira=amount,
            reference=ref,
            callback_url=callback_url,
            metadata=metadata,
            subaccount_code=subaccount_code,
        )
        return ProviderIntent(
            reference=data.get("reference") or ref,
            status="pending",
            authorization_url=data.get("authorization_url"),
            access_code=data.get("access_code"),
        )


PROVIDERS: dict[str, BaseProvider] = {
    "stripe": StripeProvider(),
    "paystack": PaystackProvider(),
    "flutterwave": FlutterwaveProvider(),
}


def get_provider(provider_name: str) -> BaseProvider:
    provider = PROVIDERS.get(provider_name)
    if not provider:
        raise ValueError(f"Unsupported provider: {provider_name}")
    return provider


def verify_webhook_signature(payload: bytes, signature_header: str | None) -> bool:
    """Legacy generic HMAC-SHA256 verifier (non-Paystack stubs)."""
    settings = get_settings()
    secret = settings.payment_webhook_secret
    if not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")


def verify_paystack_signature(payload: bytes, signature_header: str | None) -> bool:
    """Paystack uses HMAC-SHA512 of the raw body with the secret key."""
    settings = get_settings()
    secret = (settings.paystack_webhook_secret or settings.paystack_secret_key or settings.payment_webhook_secret or "").strip()
    if not secret or not signature_header:
        return False
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature_header)
