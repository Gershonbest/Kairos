"""Add outbound_messages and client reminder preference fields.

Revision ID: 20260819_25
Revises: 20260818_24
Create Date: 2026-08-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260819_25"
down_revision: str | None = "20260818_24"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "notification_preferences",
        sa.Column(
            "client_reminder_email",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "notification_preferences",
        sa.Column(
            "client_reminder_sms",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "notification_preferences",
        sa.Column(
            "client_reminder_whatsapp",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "notification_preferences",
        sa.Column(
            "client_reminder_voice",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "notification_preferences",
        sa.Column(
            "reminder_offsets_minutes",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[1440, 120]'"),
        ),
    )

    op.create_table(
        "outbound_messages",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("booking_id", sa.String(length=36), sa.ForeignKey("bookings.id"), nullable=False),
        sa.Column("client_id", sa.String(length=36), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("purpose", sa.String(length=40), nullable=False),
        sa.Column("offset_minutes", sa.Integer(), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("to_address", sa.String(length=255), nullable=False),
        sa.Column("template_key", sa.String(length=80), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("provider_message_id", sa.String(length=160), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint(
            "booking_id",
            "channel",
            "purpose",
            "offset_minutes",
            name="uq_outbound_booking_channel_purpose_offset",
        ),
    )
    op.create_index("ix_outbound_messages_tenant_id", "outbound_messages", ["tenant_id"])
    op.create_index("ix_outbound_messages_booking_id", "outbound_messages", ["booking_id"])
    op.create_index("ix_outbound_messages_client_id", "outbound_messages", ["client_id"])
    op.create_index("ix_outbound_messages_scheduled_for", "outbound_messages", ["scheduled_for"])
    op.create_index("ix_outbound_messages_due", "outbound_messages", ["status", "scheduled_for"])


def downgrade() -> None:
    op.drop_index("ix_outbound_messages_due", table_name="outbound_messages")
    op.drop_index("ix_outbound_messages_scheduled_for", table_name="outbound_messages")
    op.drop_index("ix_outbound_messages_client_id", table_name="outbound_messages")
    op.drop_index("ix_outbound_messages_booking_id", table_name="outbound_messages")
    op.drop_index("ix_outbound_messages_tenant_id", table_name="outbound_messages")
    op.drop_table("outbound_messages")
    op.drop_column("notification_preferences", "reminder_offsets_minutes")
    op.drop_column("notification_preferences", "client_reminder_voice")
    op.drop_column("notification_preferences", "client_reminder_whatsapp")
    op.drop_column("notification_preferences", "client_reminder_sms")
    op.drop_column("notification_preferences", "client_reminder_email")
