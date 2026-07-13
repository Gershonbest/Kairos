"""Schemas for payment provider and transaction data."""

from pydantic import BaseModel, Field


class PaymentIntentRequest(BaseModel):
    booking_id: str
    provider: str = Field(pattern="^(stripe|paystack|flutterwave)$")
    amount: float = Field(gt=0)
    idempotency_key: str = Field(min_length=6, max_length=120)


class PaymentIntentResponse(BaseModel):
    transaction_id: str
    provider: str
    provider_reference: str
    status: str
