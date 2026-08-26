"""Schemas for subscription plans and billing."""

from pydantic import BaseModel, Field, field_validator

from app.core.plans import ADMIN_FLAG_KEYS, PlanCode


class ActivatePlanRequest(BaseModel):
    plan_code: PlanCode = Field(description="standard, premium, or enterprise")


class AdminPlanUpdate(BaseModel):
    code: PlanCode
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    monthly_price: float = Field(ge=0)
    self_serve: bool
    is_featured: bool
    is_active: bool = True
    bookings_per_month: int | None = Field(default=None, ge=1)
    team_members: int | None = Field(default=None, ge=1)
    flags: dict[str, bool] = Field(default_factory=dict)

    @field_validator("flags")
    @classmethod
    def validate_flags(cls, value: dict[str, bool]) -> dict[str, bool]:
        unknown = set(value) - ADMIN_FLAG_KEYS
        if unknown:
            raise ValueError(f"Unknown capability flags: {', '.join(sorted(unknown))}")
        return value


class AdminPlansReplaceRequest(BaseModel):
    plans: list[AdminPlanUpdate]
