"""Adds tenant trial and subscription billing fields."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260629_09"
down_revision: str | None = "20260629_08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("trial_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tenants", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tenants", sa.Column("trial_warning_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tenants", sa.Column("subscription_paid_until", sa.DateTime(timezone=True), nullable=True))

    op.execute(
        """
        UPDATE tenants
        SET trial_started_at = created_at,
            trial_ends_at = created_at + INTERVAL '7 days'
        WHERE trial_started_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE tenants
        SET status = 'trial'
        WHERE status = 'active'
          AND subscription_paid_until IS NULL
          AND trial_ends_at > NOW()
        """
    )
    op.execute(
        """
        UPDATE tenants
        SET status = 'expired'
        WHERE subscription_paid_until IS NULL
          AND trial_ends_at IS NOT NULL
          AND trial_ends_at <= NOW()
          AND status IN ('active', 'trial')
        """
    )


def downgrade() -> None:
    op.drop_column("tenants", "subscription_paid_until")
    op.drop_column("tenants", "trial_warning_sent_at")
    op.drop_column("tenants", "trial_ends_at")
    op.drop_column("tenants", "trial_started_at")
