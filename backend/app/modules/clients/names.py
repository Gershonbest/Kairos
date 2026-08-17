"""Name helpers for canonical clients and per-visit booking aliases."""

from __future__ import annotations

from app.infra.models import Booking, Client


def split_person_name(full_name: str | None) -> tuple[str, str]:
    parts = [part for part in (full_name or "").strip().split() if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def compose_full_name(first_name: str | None, last_name: str | None) -> str:
    return f"{(first_name or '').strip()} {(last_name or '').strip()}".strip()


def visit_display_name(booking: Booking, client: Client | None = None) -> str:
    composed = compose_full_name(
        getattr(booking, "guest_first_name", None),
        getattr(booking, "guest_last_name", None),
    )
    if composed:
        return composed
    return profile_display_name(client)


def profile_display_name(client: Client | None = None) -> str:
    if not client:
        return ""
    full_name = getattr(client, "full_name", None)
    if full_name:
        return str(full_name)
    return compose_full_name(getattr(client, "first_name", None), getattr(client, "last_name", None))


def apply_canonical_full_name(client: Client, full_name: str) -> None:
    cleaned = full_name.strip()
    first_name, last_name = split_person_name(cleaned)
    client.first_name = first_name
    client.last_name = last_name
    client.full_name = (compose_full_name(first_name, last_name) or cleaned)[:120]
