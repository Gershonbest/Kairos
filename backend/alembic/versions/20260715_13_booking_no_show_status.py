"""Adds no_show booking status for appointment outcomes."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260715_13"
down_revision: str | None = "20260714_12"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE bookingstatus ADD VALUE IF NOT EXISTS 'no_show'")


def downgrade() -> None:
    # PostgreSQL cannot easily remove enum values; leave no_show in place.
    pass
