"""Schemas for client email templates and sends."""

from pydantic import BaseModel, Field


class ClientEmailTemplateOut(BaseModel):
    id: str
    name: str
    subject: str
    body: str
    is_system: bool = False


class ClientEmailTemplateCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    subject: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=2, max_length=8000)


class ClientEmailTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    subject: str | None = Field(default=None, min_length=2, max_length=200)
    body: str | None = Field(default=None, min_length=2, max_length=8000)


class ClientEmailPreviewIn(BaseModel):
    template_id: str | None = None
    subject: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=8000)


class ClientEmailPreviewOut(BaseModel):
    subject: str
    body: str


class ClientEmailSendIn(BaseModel):
    template_id: str | None = None
    subject: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=2, max_length=8000)


class ClientEmailSendOut(BaseModel):
    ok: bool
    message: str
