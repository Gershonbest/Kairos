"""Add listing-based service bookings and listing catalog support.

Revision ID: 20260810_19
Revises: 20260806_18
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260810_19"
down_revision: str | None = "20260806_18"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    booking_type_enum = postgresql.ENUM(
        "general",
        "listing",
        name="servicebookingtype",
        create_type=False,
    )
    listing_status_enum = postgresql.ENUM(
        "available",
        "reserved",
        "sold",
        "hidden",
        name="listingstatus",
        create_type=False,
    )
    booking_type_enum.create(op.get_bind(), checkfirst=True)
    listing_status_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "services",
        sa.Column("booking_type", booking_type_enum, nullable=False, server_default="general"),
    )

    op.create_table(
        "listings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", listing_status_enum, nullable=False, server_default="available"),
        sa.Column("image_urls", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_listings_tenant_id", "listings", ["tenant_id"])
    op.create_index(
        "ix_listings_tenant_status_active",
        "listings",
        ["tenant_id", "status", "active"],
    )

    op.create_table(
        "service_listings",
        sa.Column("service_id", sa.String(length=36), sa.ForeignKey("services.id"), nullable=False),
        sa.Column("listing_id", sa.String(length=36), sa.ForeignKey("listings.id"), nullable=False),
        sa.PrimaryKeyConstraint("service_id", "listing_id"),
    )
    op.create_index("ix_service_listings_listing_id", "service_listings", ["listing_id"])

    op.add_column("bookings", sa.Column("listing_id", sa.String(length=36), nullable=True))
    op.create_foreign_key(
        "fk_bookings_listing_id_listings",
        "bookings",
        "listings",
        ["listing_id"],
        ["id"],
    )
    op.create_index("ix_bookings_listing_id", "bookings", ["listing_id"])

    op.drop_constraint("uq_booking_slot", "bookings", type_="unique")
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


def downgrade() -> None:
    op.drop_index("uq_booking_slot_listing", table_name="bookings")
    op.drop_index("uq_booking_slot_general", table_name="bookings")
    op.create_unique_constraint("uq_booking_slot", "bookings", ["tenant_id", "service_id", "start_at"])

    op.drop_index("ix_bookings_listing_id", table_name="bookings")
    op.drop_constraint("fk_bookings_listing_id_listings", "bookings", type_="foreignkey")
    op.drop_column("bookings", "listing_id")

    op.drop_index("ix_service_listings_listing_id", table_name="service_listings")
    op.drop_table("service_listings")
    op.drop_index("ix_listings_tenant_status_active", table_name="listings")
    op.drop_index("ix_listings_tenant_id", table_name="listings")
    op.drop_table("listings")

    op.drop_column("services", "booking_type")

    sa.Enum(name="listingstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="servicebookingtype").drop(op.get_bind(), checkfirst=True)
