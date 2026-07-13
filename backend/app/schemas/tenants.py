"""Schemas for tenant profile and onboarding data."""

from pydantic import BaseModel, Field, field_validator, model_validator


def _optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class TenantBranch(BaseModel):
    id: str = Field(min_length=4, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    country_code: str = Field(min_length=2, max_length=2)
    state: str | None = Field(default=None, max_length=120)
    address_line: str = Field(min_length=2, max_length=300)
    phone_country_code: str | None = Field(default=None, max_length=8)
    phone_number: str | None = Field(default=None, max_length=30)
    latitude: float | None = None
    longitude: float | None = None
    is_primary: bool = False

    @field_validator("state", mode="before")
    @classmethod
    def normalize_state(cls, value: str | None) -> str | None:
        return _optional_text(value)


class TenantOnboardingUpdate(BaseModel):
    business_name: str = Field(min_length=2, max_length=160)
    business_type: str = Field(min_length=2, max_length=80)
    country_code: str = Field(min_length=2, max_length=2)
    state: str | None = Field(default=None, max_length=120)
    address_line: str = Field(min_length=2, max_length=300)
    phone_country_code: str = Field(min_length=2, max_length=8)
    phone_number: str = Field(min_length=5, max_length=30)
    latitude: float | None = None
    longitude: float | None = None
    logo_url: str | None = Field(default=None, max_length=500)
    branches: list[TenantBranch] = Field(default_factory=list)
    # Legacy single-line location kept for backward compatibility in lists/search.
    location: str | None = Field(default=None, max_length=300)

    @field_validator("state", mode="before")
    @classmethod
    def normalize_state(cls, value: str | None) -> str | None:
        return _optional_text(value)

    @model_validator(mode="after")
    def build_location(self) -> "TenantOnboardingUpdate":
        if not self.location:
            self.location = ", ".join(
                part for part in [self.address_line, self.state, self.country_code.upper()] if part
            )
        return self


class TenantPublicProfileUpdate(BaseModel):
    public_tagline: str | None = Field(default=None, max_length=220)
    public_description: str | None = None
    public_logo_url: str | None = Field(default=None, max_length=500)
