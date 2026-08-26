"""Schemas for booking creation and responses."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator


class PublicBookingCreateRequest(BaseModel):
    service_id: str
    listing_id: str | None = None
    start_at: datetime
    client_first_name: str | None = Field(default=None, min_length=1, max_length=60)
    client_last_name: str | None = Field(default=None, min_length=1, max_length=60)
    client_name: str | None = Field(default=None, min_length=2, max_length=120)
    client_email: EmailStr
    client_phone: str | None = None
    notes: str | None = None
    appointment_format: Literal["online", "onsite"] | None = None
    idempotency_key: str = Field(min_length=6, max_length=120)
    assigned_user_id: str | None = None

    @model_validator(mode="after")
    def resolve_visit_names(self) -> "PublicBookingCreateRequest":
        first = (self.client_first_name or "").strip()
        last = (self.client_last_name or "").strip()
        if first and last:
            self.client_first_name = first
            self.client_last_name = last
            self.client_name = f"{first} {last}".strip()[:120]
            return self
        leftover = (self.client_name or "").strip()
        parts = leftover.split()
        if len(parts) < 2:
            raise ValueError("First name and surname are required")
        self.client_first_name = parts[0][:60]
        self.client_last_name = " ".join(parts[1:])[:60]
        self.client_name = f"{self.client_first_name} {self.client_last_name}".strip()[:120]
        return self


class ManualBookingCreateRequest(BaseModel):
    client_id: str | None = None
    new_client_first_name: str | None = Field(default=None, max_length=60)
    new_client_last_name: str | None = Field(default=None, max_length=60)
    new_client_email: EmailStr | None = None
    new_client_phone: str | None = Field(default=None, max_length=30)
    service_id: str
    listing_id: str | None = None
    start_at: datetime
    guest_first_name: str | None = Field(default=None, max_length=60)
    guest_last_name: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=2000)
    appointment_format: Literal["online", "onsite"] | None = None
    send_confirmation: bool = True
    payment_status: Literal["unpaid", "paid_external"] = "unpaid"
    override_availability: bool = False
    assigned_user_id: str

    @model_validator(mode="after")
    def resolve_client_choice(self) -> "ManualBookingCreateRequest":
        if self.client_id:
            return self
        first = (self.new_client_first_name or "").strip()
        last = (self.new_client_last_name or "").strip()
        if not first or not last or not self.new_client_email:
            raise ValueError("Choose an existing client or provide the new client's name and email")
        self.new_client_first_name = first
        self.new_client_last_name = last
        return self


class BookingOut(BaseModel):
    id: str
    status: str
    start_at: datetime
    end_at: datetime
    client_id: str
    service_id: str
    listing_id: str | None = None
    listing_name: str | None = None
    listing_image_url: str | None = None
    payment_required: bool = False
    payment_amount: float | None = None
    payment_status: str | None = None
    payment_authorization_url: str | None = None
    payment_access_code: str | None = None
    payment_reference: str | None = None
    google_calendar_url: str | None = None
    ics_download_path: str | None = None
    is_all_day: bool = False
    scheduling_mode: str | None = None
    client_name: str | None = None
    client_first_name: str | None = None
    client_last_name: str | None = None
    client_profile_name: str | None = None
    client_email: str | None = None
    service_name: str | None = None
    service_price: float | None = None
    service_deposit: float | None = None
    service_image_url: str | None = None
    service_duration_minutes: int | None = None
    host_name: str | None = None
    host_title: str | None = None
    assigned_user_id: str | None = None
    assigned_name: str | None = None
    assigned_title: str | None = None
    appointment_format: str | None = None
    location: str | None = None
    business_name: str | None = None
    business_contact_email: str | None = None
    business_help_email: str | None = None
    receipt_download_path: str | None = None
    paid_at: datetime | None = None
    payment_currency: str | None = None
    online_meeting_link: str | None = None


class UpdateBookingStatusRequest(BaseModel):
    status: Literal["completed", "no_show", "cancelled", "confirmed"]


class RecordBalancePaymentRequest(BaseModel):
    amount: float = Field(gt=0)
    method: Literal["cash", "bank_transfer", "pos", "other"]
    paid_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=500)


class ReassignBookingRequest(BaseModel):
    assigned_user_id: str


class RescheduleBookingRequest(BaseModel):
    start_at: datetime
