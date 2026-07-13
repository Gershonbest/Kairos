"""Adds public branding fields to tenants migration.

Revision ID: 20260629_03
Revises: 20260629_02
Create Date: 2026-06-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260629_03"
down_revision: str | None = "20260629_02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("public_tagline", sa.String(length=220), nullable=True))
    op.add_column("tenants", sa.Column("public_description", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("public_logo_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "public_logo_url")
    op.drop_column("tenants", "public_description")
    op.drop_column("tenants", "public_tagline")
