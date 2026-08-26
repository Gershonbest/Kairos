"""Meeting integrations (Zoom / Google Meet) — superseded by 20260825_31.

Revision ID: 20260823_29
Revises: 20260823_28
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_29"
down_revision: str | None = "20260823_28"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("preferred_meeting_provider", sa.String(length=40), nullable=True))
    op.add_column("bookings", sa.Column("meeting_provider", sa.String(length=40), nullable=True))
    op.add_column("bookings", sa.Column("meeting_id", sa.String(length=120), nullable=True))
    op.add_column("bookings", sa.Column("meeting_join_url", sa.String(length=500), nullable=True))
    op.add_column("bookings", sa.Column("meeting_host_url", sa.String(length=500), nullable=True))
    op.create_table(
        "tenant_meeting_connections",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("account_email", sa.String(length=255), nullable=True),
        sa.Column("account_id", sa.String(length=120), nullable=True),
        sa.Column("access_token_enc", sa.Text(), nullable=False),
        sa.Column("refresh_token_enc", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scopes", sa.String(length=500), nullable=True),
        sa.Column("connected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "provider", name="uq_tenant_meeting_provider"),
    )
    op.create_index(
        "ix_tenant_meeting_connections_tenant",
        "tenant_meeting_connections",
        ["tenant_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_tenant_meeting_connections_tenant", table_name="tenant_meeting_connections")
    op.drop_table("tenant_meeting_connections")
    op.drop_column("bookings", "meeting_host_url")
    op.drop_column("bookings", "meeting_join_url")
    op.drop_column("bookings", "meeting_id")
    op.drop_column("bookings", "meeting_provider")
    op.drop_column("tenants", "preferred_meeting_provider")
