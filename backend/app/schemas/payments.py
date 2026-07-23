"""Schemas for payment provider and transaction data."""

from pydantic import BaseModel, EmailStr, Field


class PaymentIntentRequest(BaseModel):
    booking_id: str
    provider: str = Field(pattern="^(stripe|paystack|flutterwave)$")
    amount: float = Field(gt=0)
    idempotency_key: str = Field(min_length=6, max_length=120)
    email: EmailStr | None = None
    callback_url: str | None = None
    subaccount_code: str | None = None


class PaymentIntentResponse(BaseModel):
    transaction_id: str
    provider: str
    provider_reference: str
    status: str
    authorization_url: str | None = None
    access_code: str | None = None
