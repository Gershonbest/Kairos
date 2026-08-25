"""Add balance_waived flag on bookings for off-platform balance closure."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260825_30"
down_revision: str | None = "20260823_29"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("balance_waived", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("bookings", "balance_waived")
