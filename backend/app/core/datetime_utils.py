"""UTC datetime normalization and comparison utilities."""

from datetime import UTC, datetime


def as_utc(value: datetime) -> datetime:
    """Normalize DB datetimes for safe comparisons."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def utc_now() -> datetime:
    return datetime.now(UTC)
