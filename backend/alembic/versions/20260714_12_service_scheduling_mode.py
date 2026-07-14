"""Adds service scheduling modes and all-day bookings."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260714_12"
down_revision: str | None = "20260714_11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    scheduling_mode = sa.Enum("fixed", "flexible", "all_day", name="schedulingmode")
    scheduling_mode.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "services",
        sa.Column(
            "scheduling_mode",
            scheduling_mode,
            nullable=False,
            server_default="fixed",
        ),
    )
    op.add_column(
        "bookings",
        sa.Column("is_all_day", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("bookings", "is_all_day")
    op.drop_column("services", "scheduling_mode")
    sa.Enum(name="schedulingmode").drop(op.get_bind(), checkfirst=True)
