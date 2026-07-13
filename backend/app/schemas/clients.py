"""Schemas for client records."""

from pydantic import BaseModel, EmailStr, Field


class ClientOut(BaseModel):
    id: str
    full_name: str
    email: EmailStr
    phone: str | None
    notes: str | None
    total_bookings: int = 0
    total_spent: float = 0
    last_visit_at: str | None = None


class ClientCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    notes: str | None = None


class ClientUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    notes: str | None = None
