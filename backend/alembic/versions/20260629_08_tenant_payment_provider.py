"""Adds tenant payment provider configuration."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260629_08"
down_revision: str | None = "20260629_07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("payment_provider", sa.String(length=40), nullable=True))
    op.add_column("tenants", sa.Column("payment_account_id", sa.String(length=120), nullable=True))
    op.add_column(
        "tenants",
        sa.Column("payments_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("tenants", "payments_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("tenants", "payments_enabled")
    op.drop_column("tenants", "payment_account_id")
    op.drop_column("tenants", "payment_provider")
