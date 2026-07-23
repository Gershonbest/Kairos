"""Request and response schemas for authentication flows."""

from pydantic import BaseModel, EmailStr, Field


class SignUpRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    business_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class SignUpResponse(BaseModel):
    needs_email_verification: bool
    email: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=16, max_length=256)


class VerifyEmailResponse(BaseModel):
    ok: bool
    access_token: str
    refresh_token: str
    onboarding_completed: bool
    token_type: str = "bearer"


class UpdateProfileRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=128)
    new_email: EmailStr | None = None


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(min_length=20, max_length=4096)
    business_name: str | None = Field(default=None, min_length=2, max_length=160)


class GoogleAuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    is_new_user: bool
    token_type: str = "bearer"
