"""Track dashboard-created bookings and their creator.

Revision ID: 20260817_22
Revises: 20260817_21
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260817_22"
down_revision: str | None = "20260817_21"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("booking_source", sa.String(length=20), nullable=False, server_default="public"),
    )
    op.add_column(
        "bookings",
        sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_bookings_created_by_user_id",
        "bookings",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column("bookings", "booking_source", server_default=None)


def downgrade() -> None:
    op.drop_constraint("fk_bookings_created_by_user_id", "bookings", type_="foreignkey")
    op.drop_column("bookings", "created_by_user_id")
    op.drop_column("bookings", "booking_source")
