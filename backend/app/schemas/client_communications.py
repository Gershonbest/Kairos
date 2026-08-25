"""Schemas for client communication history."""

from typing import Literal

from pydantic import BaseModel, Field


class ClientCommunicationOut(BaseModel):
    id: str
    channel: Literal["email", "phone_call", "whatsapp"]
    status: str
    recipient: str
    subject: str | None = None
    summary: str | None = None
    template_id: str | None = None
    template_name: str | None = None
    actor_name: str | None = None
    created_at: str


class ClientCommunicationLogIn(BaseModel):
    channel: Literal["phone_call", "whatsapp"]
    phone: str | None = Field(default=None, max_length=30)
