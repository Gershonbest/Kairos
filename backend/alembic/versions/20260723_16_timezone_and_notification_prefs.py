"""Add tenant timezone and notification_preferences table."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_16"
down_revision: str | None = "20260723_15"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Africa/Lagos"),
    )
    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("booking_created_email", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("payment_received_email", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sms_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", name="uq_notification_preferences_tenant"),
    )


def downgrade() -> None:
    op.drop_table("notification_preferences")
    op.drop_column("tenants", "timezone")
