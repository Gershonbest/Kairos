"""Payment provider adapter interfaces and stubs."""

import hashlib
import hmac
import uuid
from dataclasses import dataclass

from app.core.config import get_settings


@dataclass
class ProviderIntent:
    reference: str
    status: str


class BaseProvider:
    code: str

    async def create_intent(self, amount: float, booking_id: str) -> ProviderIntent:
        return ProviderIntent(reference=f"{self.code}_{booking_id}_{uuid.uuid4().hex[:8]}", status="pending")


class StripeProvider(BaseProvider):
    code = "stripe"


class PaystackProvider(BaseProvider):
    code = "paystack"


class FlutterwaveProvider(BaseProvider):
    code = "flutterwave"


PROVIDERS = {
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
    settings = get_settings()
    secret = settings.payment_webhook_secret
    if not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")
