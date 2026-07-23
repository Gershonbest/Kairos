"""Schemas for tenant profile and onboarding data."""

import re

from pydantic import BaseModel, Field, field_validator, model_validator


def _optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


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
    help_email: str | None = Field(default=None, max_length=255)
    timezone: str | None = Field(default=None, max_length=64)
    branches: list[TenantBranch] = Field(default_factory=list)
    # Legacy single-line location kept for backward compatibility in lists/search.
    location: str | None = Field(default=None, max_length=300)

    @field_validator("state", "help_email", "timezone", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return _optional_text(value)

    @model_validator(mode="after")
    def build_location(self) -> "TenantOnboardingUpdate":
        if not self.location:
            self.location = ", ".join(
                part for part in [self.address_line, self.state, self.country_code.upper()] if part
            )
        return self


class TenantProfileUpdate(BaseModel):
    """Partial post-onboarding business profile update."""

    business_name: str | None = Field(default=None, min_length=2, max_length=160)
    business_type: str | None = Field(default=None, min_length=2, max_length=80)
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    state: str | None = Field(default=None, max_length=120)
    address_line: str | None = Field(default=None, min_length=2, max_length=300)
    phone_country_code: str | None = Field(default=None, min_length=2, max_length=8)
    phone_number: str | None = Field(default=None, min_length=5, max_length=30)
    latitude: float | None = None
    longitude: float | None = None
    logo_url: str | None = Field(default=None, max_length=500)
    help_email: str | None = Field(default=None, max_length=255)
    timezone: str | None = Field(default=None, max_length=64)
    public_slug: str | None = Field(default=None, min_length=3, max_length=180)
    branches: list[TenantBranch] | None = None
    location: str | None = Field(default=None, max_length=300)

    @field_validator("state", "help_email", "timezone", "logo_url", "location", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return _optional_text(value)

    @field_validator("public_slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: str | None) -> str | None:
        text = _optional_text(value)
        if text is None:
            return None
        return text.lower()

    @field_validator("public_slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not _SLUG_RE.match(value):
            raise ValueError("Slug must be lowercase letters, numbers, and hyphens only")
        return value

    @field_validator("country_code")
    @classmethod
    def upper_country(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class TenantPublicProfileUpdate(BaseModel):
    public_tagline: str | None = Field(default=None, max_length=220)
    public_description: str | None = None
    public_logo_url: str | None = Field(default=None, max_length=500)
    public_slug: str | None = Field(default=None, min_length=3, max_length=180)

    @field_validator("public_slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: str | None) -> str | None:
        text = _optional_text(value)
        if text is None:
            return None
        return text.lower()

    @field_validator("public_slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not _SLUG_RE.match(value):
            raise ValueError("Slug must be lowercase letters, numbers, and hyphens only")
        return value


class NotificationPreferencesUpdate(BaseModel):
    email_enabled: bool | None = None
    booking_created_email: bool | None = None
    payment_received_email: bool | None = None
    sms_enabled: bool | None = None
