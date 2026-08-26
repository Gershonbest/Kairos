"""Team invite and member schemas."""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field

StaffRoleLiteral = Literal["manager", "staff", "front_desk"]


class TeamInviteCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    staff_role: StaffRoleLiteral


class TeamMemberUpdateRequest(BaseModel):
    staff_role: StaffRoleLiteral | None = None
    job_title: str | None = Field(default=None, max_length=80)
    is_bookable: bool | None = None
    is_active: bool | None = None


class AcceptInviteRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)
