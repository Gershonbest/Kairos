"""Add client_communications table for manual outreach history.

Revision ID: 20260826_33
Revises: 20260825_32
Create Date: 2026-08-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260826_33"
down_revision: str | None = "20260825_32"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "client_communications",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("client_id", sa.String(length=36), nullable=False),
        sa.Column("actor_user_id", sa.String(length=36), nullable=True),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="sent", nullable=False),
        sa.Column("recipient", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=True),
        sa.Column("summary", sa.String(length=500), nullable=True),
        sa.Column("template_id", sa.String(length=80), nullable=True),
        sa.Column("template_name", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_client_communications_client_created", "client_communications", ["client_id", "created_at"])
    op.create_index("ix_client_communications_tenant_id", "client_communications", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_client_communications_tenant_id", table_name="client_communications")
    op.drop_index("ix_client_communications_client_created", table_name="client_communications")
    op.drop_table("client_communications")
