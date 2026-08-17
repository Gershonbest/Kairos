"""Add date ranges for business calendar blocks.

Revision ID: 20260817_23
Revises: 20260817_22
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260817_23"
down_revision: str | None = "20260817_22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "calendar_blocks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("end_date >= start_date", name="ck_calendar_blocks_date_order"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calendar_blocks_tenant_id", "calendar_blocks", ["tenant_id"])
    op.create_index("ix_calendar_blocks_start_date", "calendar_blocks", ["start_date"])
    op.create_index("ix_calendar_blocks_end_date", "calendar_blocks", ["end_date"])


def downgrade() -> None:
    op.drop_index("ix_calendar_blocks_end_date", table_name="calendar_blocks")
    op.drop_index("ix_calendar_blocks_start_date", table_name="calendar_blocks")
    op.drop_index("ix_calendar_blocks_tenant_id", table_name="calendar_blocks")
    op.drop_table("calendar_blocks")
