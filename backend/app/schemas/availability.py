"""Schemas for availability rule payloads."""

from pydantic import BaseModel, Field


class AvailabilityRuleIn(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    is_enabled: bool = True


class AvailabilityRulesReplaceRequest(BaseModel):
    rules: list[AvailabilityRuleIn]
