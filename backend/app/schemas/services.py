"""Schemas for service catalog items."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

AppointmentTypeLiteral = Literal["online", "onsite", "hybrid"]
SchedulingModeLiteral = Literal["fixed", "flexible", "all_day"]


class ServiceBase(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    description: str | None = None
    duration_minutes: int = Field(default=60, ge=5, le=1440)
    scheduling_mode: SchedulingModeLiteral = "fixed"
    price_amount: float = Field(gt=0)
    deposit_amount: float | None = Field(default=None, ge=0)
    appointment_type: AppointmentTypeLiteral = "onsite"
    location: str | None = Field(default=None, max_length=300)
    use_business_location: bool = True
    host_name: str | None = Field(default=None, max_length=120)
    host_title: str | None = Field(default=None, max_length=80)
    online_meeting_link: str | None = Field(default=None, max_length=500)
    client_instructions: str | None = Field(default=None, max_length=2000)
    buffer_minutes: int = Field(default=0, ge=0, le=120)
    image_url: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_appointment_details(self) -> "ServiceBase":
        if self.scheduling_mode == "all_day":
            self.duration_minutes = 1440
        if self.appointment_type in {"onsite", "hybrid"} and not self.use_business_location:
            if not (self.location or "").strip():
                raise ValueError("Location is required when not using the business address")
        return self


class ServiceCreate(ServiceBase):
    active: bool = True


class ServiceUpdate(ServiceBase):
    active: bool = True


class ServiceOut(BaseModel):
    id: str
    name: str
    description: str | None
    duration_minutes: int
    scheduling_mode: SchedulingModeLiteral
    price_amount: float
    deposit_amount: float | None
    appointment_type: AppointmentTypeLiteral
    location: str | None
    use_business_location: bool
    host_name: str | None
    host_title: str | None
    online_meeting_link: str | None
    client_instructions: str | None
    buffer_minutes: int
    image_url: str | None
    active: bool
