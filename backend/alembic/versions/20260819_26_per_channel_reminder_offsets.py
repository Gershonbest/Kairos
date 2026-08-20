"""Store per-channel reminder offsets on notification_preferences.

Revision ID: 20260819_26
Revises: 20260819_25
Create Date: 2026-08-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260819_26"
down_revision: str | None = "20260819_25"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_DEFAULT = '{"email": [1440, 120], "sms": [1440, 120], "whatsapp": [1440, 120], "voice": [1440, 120]}'


def upgrade() -> None:
    op.execute(
        """
        UPDATE notification_preferences
        SET reminder_offsets_minutes = json_build_object(
            'email', reminder_offsets_minutes,
            'sms', reminder_offsets_minutes,
            'whatsapp', reminder_offsets_minutes,
            'voice', reminder_offsets_minutes
        )
        WHERE json_typeof(reminder_offsets_minutes) = 'array'
        """
    )
    op.alter_column(
        "notification_preferences",
        "reminder_offsets_minutes",
        server_default=sa.text(f"'{NEW_DEFAULT}'::json"),
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE notification_preferences
        SET reminder_offsets_minutes = COALESCE(
            reminder_offsets_minutes->'email',
            '[1440, 120]'::json
        )
        WHERE json_typeof(reminder_offsets_minutes) = 'object'
        """
    )
    op.alter_column(
        "notification_preferences",
        "reminder_offsets_minutes",
        server_default=sa.text("'[1440, 120]'::json"),
    )
