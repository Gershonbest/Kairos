"""Add client first/last name and per-booking guest names.

Revision ID: 20260817_21
Revises: 20260817_20
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260817_21"
down_revision: str | None = "20260817_20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _split_name(full_name: str | None) -> tuple[str, str]:
    parts = [part for part in (full_name or "").strip().split() if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0][:60], ""
    return parts[0][:60], " ".join(parts[1:])[:60]


def upgrade() -> None:
    op.add_column("clients", sa.Column("first_name", sa.String(length=60), nullable=False, server_default=""))
    op.add_column("clients", sa.Column("last_name", sa.String(length=60), nullable=False, server_default=""))
    op.add_column("bookings", sa.Column("guest_first_name", sa.String(length=60), nullable=False, server_default=""))
    op.add_column("bookings", sa.Column("guest_last_name", sa.String(length=60), nullable=False, server_default=""))

    bind = op.get_bind()
    clients = bind.execute(sa.text("SELECT id, full_name FROM clients")).mappings().all()
    for row in clients:
        first_name, last_name = _split_name(row["full_name"])
        bind.execute(
            sa.text("UPDATE clients SET first_name = :first_name, last_name = :last_name WHERE id = :id"),
            {"first_name": first_name, "last_name": last_name, "id": row["id"]},
        )

    bookings = bind.execute(
        sa.text(
            """
            SELECT bookings.id, clients.full_name
            FROM bookings
            JOIN clients ON clients.id = bookings.client_id
            """
        )
    ).mappings().all()
    for row in bookings:
        first_name, last_name = _split_name(row["full_name"])
        bind.execute(
            sa.text(
                "UPDATE bookings SET guest_first_name = :first_name, guest_last_name = :last_name WHERE id = :id"
            ),
            {"first_name": first_name, "last_name": last_name, "id": row["id"]},
        )

    op.alter_column("clients", "first_name", server_default=None)
    op.alter_column("clients", "last_name", server_default=None)
    op.alter_column("bookings", "guest_first_name", server_default=None)
    op.alter_column("bookings", "guest_last_name", server_default=None)


def downgrade() -> None:
    op.drop_column("bookings", "guest_last_name")
    op.drop_column("bookings", "guest_first_name")
    op.drop_column("clients", "last_name")
    op.drop_column("clients", "first_name")
