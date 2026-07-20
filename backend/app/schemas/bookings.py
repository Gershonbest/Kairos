"""Schemas for booking creation and responses."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class PublicBookingCreateRequest(BaseModel):
    service_id: str
    start_at: datetime
    client_name: str = Field(min_length=2, max_length=120)
    client_email: EmailStr
    client_phone: str | None = None
    notes: str | None = None
    appointment_format: Literal["online", "onsite"] | None = None
    idempotency_key: str = Field(min_length=6, max_length=120)


class BookingOut(BaseModel):
    id: str
    status: str
    start_at: datetime
    end_at: datetime
    client_id: str
    service_id: str
    payment_required: bool = False
    payment_amount: float | None = None
    payment_status: str | None = None
    google_calendar_url: str | None = None
    ics_download_path: str | None = None
    is_all_day: bool = False
    scheduling_mode: str | None = None


class UpdateBookingStatusRequest(BaseModel):
    status: Literal["completed", "no_show", "cancelled", "confirmed"]
