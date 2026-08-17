"""Limit unique booking slots to pending and confirmed rows.

Revision ID: 20260817_20
Revises: 20260810_19
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260817_20"
down_revision: str | None = "20260810_19"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("uq_booking_slot_listing", table_name="bookings")
    op.drop_index("uq_booking_slot_general", table_name="bookings")
    op.create_index(
        "uq_booking_slot_general",
        "bookings",
        ["tenant_id", "service_id", "start_at"],
        unique=True,
        postgresql_where=sa.text("listing_id IS NULL AND status IN ('pending'::bookingstatus, 'confirmed'::bookingstatus)"),
    )
    op.create_index(
        "uq_booking_slot_listing",
        "bookings",
        ["tenant_id", "service_id", "listing_id", "start_at"],
        unique=True,
        postgresql_where=sa.text("listing_id IS NOT NULL AND status IN ('pending'::bookingstatus, 'confirmed'::bookingstatus)"),
    )


def downgrade() -> None:
    op.drop_index("uq_booking_slot_listing", table_name="bookings")
    op.drop_index("uq_booking_slot_general", table_name="bookings")
    op.create_index(
        "uq_booking_slot_general",
        "bookings",
        ["tenant_id", "service_id", "start_at"],
        unique=True,
        postgresql_where=sa.text("listing_id IS NULL"),
    )
    op.create_index(
        "uq_booking_slot_listing",
        "bookings",
        ["tenant_id", "service_id", "listing_id", "start_at"],
        unique=True,
        postgresql_where=sa.text("listing_id IS NOT NULL"),
    )
