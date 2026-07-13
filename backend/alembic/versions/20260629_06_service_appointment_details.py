"""Adds appointment format, location, host, and booking detail fields to services."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260629_06"
down_revision: str | None = "20260629_05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

appointment_type = sa.Enum("online", "onsite", "hybrid", name="appointmenttype")
appointment_format = sa.Enum("online", "onsite", name="appointmentformat")


def upgrade() -> None:
    appointment_type.create(op.get_bind(), checkfirst=True)
    appointment_format.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "services",
        sa.Column("appointment_type", appointment_type, nullable=False, server_default="onsite"),
    )
    op.add_column("services", sa.Column("location", sa.String(length=300), nullable=True))
    op.add_column(
        "services",
        sa.Column("use_business_location", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column("services", sa.Column("host_name", sa.String(length=120), nullable=True))
    op.add_column("services", sa.Column("host_title", sa.String(length=80), nullable=True))
    op.add_column("services", sa.Column("online_meeting_link", sa.String(length=500), nullable=True))
    op.add_column("services", sa.Column("client_instructions", sa.Text(), nullable=True))
    op.add_column(
        "services",
        sa.Column("buffer_minutes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("services", "appointment_type", server_default=None)
    op.alter_column("services", "use_business_location", server_default=None)
    op.alter_column("services", "buffer_minutes", server_default=None)

    op.add_column("bookings", sa.Column("appointment_format", appointment_format, nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "appointment_format")
    op.drop_column("services", "buffer_minutes")
    op.drop_column("services", "client_instructions")
    op.drop_column("services", "online_meeting_link")
    op.drop_column("services", "host_title")
    op.drop_column("services", "host_name")
    op.drop_column("services", "use_business_location")
    op.drop_column("services", "location")
    op.drop_column("services", "appointment_type")
    appointment_format.drop(op.get_bind(), checkfirst=True)
    appointment_type.drop(op.get_bind(), checkfirst=True)
