"""Adds admin-configurable subscription plan settings."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260709_10"
down_revision: str | None = "20260629_09"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("subscription_plans", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("subscription_plans", sa.Column("features", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("subscription_plans", sa.Column("self_serve", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("subscription_plans", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("subscription_plans", sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("subscription_plans", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))

    op.execute(
        """
        UPDATE subscription_plans
        SET self_serve = TRUE,
            is_active = TRUE,
            sort_order = 1,
            description = 'Perfect for solo practitioners and small teams getting started',
            features = '["Up to 100 bookings/month","1 team member","Email notifications","Client database","Mobile booking page","Standard support"]'::json
        WHERE code = 'standard'
        """
    )
    op.execute(
        """
        UPDATE subscription_plans
        SET self_serve = TRUE,
            is_active = TRUE,
            is_featured = TRUE,
            sort_order = 2,
            description = 'For growing businesses that need advanced features and AI',
            features = '["Unlimited bookings","Up to 5 team members","AI booking assistant","Payment processing","Custom branding","Priority support","Analytics dashboard"]'::json
        WHERE code = 'premium'
        """
    )
    op.execute(
        """
        UPDATE subscription_plans
        SET self_serve = FALSE,
            is_active = TRUE,
            sort_order = 3,
            description = 'Complete solution for multi-location businesses',
            features = '["Everything in Premium","Unlimited team members","Multi-location support","API access","White-label options","Dedicated account manager"]'::json
        WHERE code = 'enterprise'
        """
    )


def downgrade() -> None:
    op.drop_column("subscription_plans", "sort_order")
    op.drop_column("subscription_plans", "is_featured")
    op.drop_column("subscription_plans", "is_active")
    op.drop_column("subscription_plans", "self_serve")
    op.drop_column("subscription_plans", "features")
    op.drop_column("subscription_plans", "description")
