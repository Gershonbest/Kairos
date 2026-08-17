"""Schemas for weekly availability and calendar block payloads."""

from datetime import date

from pydantic import BaseModel, Field, model_validator


class AvailabilityRuleIn(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    is_enabled: bool = True


class AvailabilityRulesReplaceRequest(BaseModel):
    rules: list[AvailabilityRuleIn]


class CalendarBlockCreateRequest(BaseModel):
    start_date: date
    end_date: date
    reason: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def validate_date_order(self) -> "CalendarBlockCreateRequest":
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after the start date")
        return self
