"""Schemas for listing catalog management."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ListingStatusLiteral = Literal["available", "reserved", "sold", "hidden"]


class ListingBase(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = None
    status: ListingStatusLiteral = "available"
    image_urls: list[str] = Field(default_factory=list)
    active: bool = True
    service_ids: list[str] = Field(default_factory=list)


class ListingCreate(ListingBase):
    pass


class ListingUpdate(ListingBase):
    pass


class ListingOut(BaseModel):
    id: str
    name: str
    description: str | None
    status: ListingStatusLiteral
    image_urls: list[str] = Field(default_factory=list)
    active: bool
    service_ids: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None
