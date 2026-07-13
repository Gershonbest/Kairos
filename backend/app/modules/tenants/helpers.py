"""Tenant location formatting helpers."""

from app.infra.models import Tenant
from app.schemas.tenants import TenantBranch


def format_location_parts(
    *,
    address_line: str | None,
    state: str | None,
    country_code: str | None,
) -> str | None:
    parts = [address_line, state, country_code.upper() if country_code else None]
    cleaned = [part for part in parts if part]
    return ", ".join(cleaned) if cleaned else None


def tenant_display_location(tenant: Tenant) -> str | None:
    formatted = format_location_parts(
        address_line=tenant.address_line,
        state=tenant.state,
        country_code=tenant.country_code,
    )
    return formatted or tenant.location


def branches_to_dict(branches: list[TenantBranch]) -> list[dict]:
    return [branch.model_dump() for branch in branches]
