"""Store full settlement bank details on tenants.

Revision ID: 20260818_24
Revises: 20260817_23
Create Date: 2026-08-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260818_24"
down_revision: str | None = "20260817_23"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("settlement_bank_name", sa.String(length=120), nullable=True))
    op.add_column("tenants", sa.Column("settlement_account_name", sa.String(length=200), nullable=True))
    op.add_column("tenants", sa.Column("settlement_account_number", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "settlement_account_number")
    op.drop_column("tenants", "settlement_account_name")
    op.drop_column("tenants", "settlement_bank_name")
