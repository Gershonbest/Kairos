"""Schemas for subscription plans and billing."""

from pydantic import BaseModel, Field

from app.core.plans import PlanCode


class ActivatePlanRequest(BaseModel):
    plan_code: PlanCode = Field(description="standard, premium, or enterprise")
