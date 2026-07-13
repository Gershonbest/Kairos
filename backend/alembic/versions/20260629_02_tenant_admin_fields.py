"""Adds tenant admin profile and onboarding fields migration.

Revision ID: 20260629_02
Revises: 20260629_01
Create Date: 2026-06-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260629_02"
down_revision: str | None = "20260629_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("status", sa.String(length=20), nullable=False, server_default="active"))
    op.add_column(
        "tenants",
        sa.Column("plan_code", sa.String(length=20), nullable=False, server_default="standard"),
    )
    op.add_column("tenants", sa.Column("public_slug", sa.String(length=180), nullable=True))
    op.create_unique_constraint("uq_tenants_public_slug", "tenants", ["public_slug"])


def downgrade() -> None:
    op.drop_constraint("uq_tenants_public_slug", "tenants", type_="unique")
    op.drop_column("tenants", "public_slug")
    op.drop_column("tenants", "plan_code")
    op.drop_column("tenants", "status")
