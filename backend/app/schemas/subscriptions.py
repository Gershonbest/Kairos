"""Schemas for subscription plans and billing."""

from pydantic import BaseModel, Field, field_validator


class ActivatePlanRequest(BaseModel):
    plan_code: str = Field(min_length=3, max_length=40)


class PlanEntitlements(BaseModel):
    bookings_per_month: int | None = None
    team_members: int | None = None
    ai_assistant: bool = False
    custom_branding: bool = False
    payment_processing: bool = False
    api_access: bool = False
    white_label: bool = False


class CreatePlanRequest(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[a-z][a-z0-9_-]*$")
    name: str = Field(min_length=2, max_length=80)
    monthly_price: float = Field(ge=0)
    description: str | None = Field(default=None, max_length=500)
    features: list[str] = Field(default_factory=list)
    entitlements: PlanEntitlements = Field(default_factory=PlanEntitlements)
    self_serve: bool = False
    is_active: bool = True
    is_featured: bool = False
    sort_order: int = 0


class UpdatePlanRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    monthly_price: float | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=500)
    features: list[str] | None = None
    entitlements: PlanEntitlements | None = None
    self_serve: bool | None = None
    is_active: bool | None = None
    is_featured: bool | None = None
    sort_order: int | None = None

    @field_validator("features")
    @classmethod
    def strip_features(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return [feature.strip() for feature in value if feature.strip()]
