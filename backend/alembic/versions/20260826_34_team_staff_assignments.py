"""Team seats, staff roles, and per-person booking assignment.

Revision ID: 20260826_34
Revises: 20260826_33
Create Date: 2026-08-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260826_34"
down_revision: str | None = "20260826_33"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("staff_role", sa.String(length=20), nullable=True))
    op.add_column("users", sa.Column("job_title", sa.String(length=80), nullable=True))
    op.add_column(
        "users",
        sa.Column("is_bookable", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )

    op.create_table(
        "service_staff",
        sa.Column("service_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("service_id", "user_id"),
    )

    op.create_table(
        "staff_availability_rules",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.String(length=5), nullable=False),
        sa.Column("end_time", sa.String(length=5), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_staff_availability_rules_tenant_id", "staff_availability_rules", ["tenant_id"])
    op.create_index("ix_staff_availability_rules_user_id", "staff_availability_rules", ["user_id"])
    op.create_index(
        "ix_staff_availability_user_day",
        "staff_availability_rules",
        ["user_id", "day_of_week"],
    )

    op.create_table(
        "team_invites",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("staff_role", sa.String(length=20), nullable=False),
        sa.Column("invited_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_team_invites_tenant_id", "team_invites", ["tenant_id"])
    op.create_index("ix_team_invites_tenant_email", "team_invites", ["tenant_id", "email"])
    op.create_index("ix_team_invites_token_hash", "team_invites", ["token_hash"], unique=True)

    op.add_column("bookings", sa.Column("assigned_user_id", sa.String(length=36), nullable=True))
    op.add_column("bookings", sa.Column("assigned_name", sa.String(length=120), nullable=True))
    op.add_column("bookings", sa.Column("assigned_title", sa.String(length=80), nullable=True))
    op.create_index("ix_bookings_assigned_user_id", "bookings", ["assigned_user_id"])
    op.create_foreign_key(
        "fk_bookings_assigned_user_id",
        "bookings",
        "users",
        ["assigned_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        """
        UPDATE users
        SET is_bookable = true
        WHERE role = 'tenant_admin'
        """
    )
    op.execute(
        """
        UPDATE bookings AS b
        SET assigned_user_id = owner.id,
            assigned_name = COALESCE(NULLIF(s.host_name, ''), owner.full_name),
            assigned_title = NULLIF(s.host_title, '')
        FROM services AS s,
        (
            SELECT DISTINCT ON (tenant_id) id, full_name, tenant_id
            FROM users
            WHERE role = 'tenant_admin'
            ORDER BY tenant_id, created_at ASC
        ) AS owner
        WHERE s.id = b.service_id
          AND owner.tenant_id = b.tenant_id
          AND b.assigned_user_id IS NULL
        """
    )
    op.execute(
        """
        INSERT INTO service_staff (service_id, user_id)
        SELECT s.id, owner.id
        FROM services AS s
        JOIN (
            SELECT DISTINCT ON (tenant_id) id, tenant_id
            FROM users
            WHERE role = 'tenant_admin'
            ORDER BY tenant_id, created_at ASC
        ) AS owner ON owner.tenant_id = s.tenant_id
        ON CONFLICT DO NOTHING
        """
    )

    op.drop_index("uq_booking_slot_general", table_name="bookings")
    op.create_index(
        "uq_booking_slot_general",
        "bookings",
        ["tenant_id", "assigned_user_id", "start_at"],
        unique=True,
        postgresql_where=sa.text(
            "listing_id IS NULL AND assigned_user_id IS NOT NULL "
            "AND status IN ('pending'::bookingstatus, 'confirmed'::bookingstatus)"
        ),
    )


def downgrade() -> None:
    op.drop_index("uq_booking_slot_general", table_name="bookings")
    op.create_index(
        "uq_booking_slot_general",
        "bookings",
        ["tenant_id", "service_id", "start_at"],
        unique=True,
        postgresql_where=sa.text(
            "listing_id IS NULL AND status IN ('pending'::bookingstatus, 'confirmed'::bookingstatus)"
        ),
    )
    op.drop_constraint("fk_bookings_assigned_user_id", "bookings", type_="foreignkey")
    op.drop_index("ix_bookings_assigned_user_id", table_name="bookings")
    op.drop_column("bookings", "assigned_title")
    op.drop_column("bookings", "assigned_name")
    op.drop_column("bookings", "assigned_user_id")

    op.drop_index("ix_team_invites_token_hash", table_name="team_invites")
    op.drop_index("ix_team_invites_tenant_email", table_name="team_invites")
    op.drop_index("ix_team_invites_tenant_id", table_name="team_invites")
    op.drop_table("team_invites")

    op.drop_index("ix_staff_availability_user_day", table_name="staff_availability_rules")
    op.drop_index("ix_staff_availability_rules_user_id", table_name="staff_availability_rules")
    op.drop_index("ix_staff_availability_rules_tenant_id", table_name="staff_availability_rules")
    op.drop_table("staff_availability_rules")
    op.drop_table("service_staff")

    op.drop_column("users", "is_bookable")
    op.drop_column("users", "job_title")
    op.drop_column("users", "staff_role")
