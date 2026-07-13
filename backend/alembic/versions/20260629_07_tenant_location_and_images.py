"""Adds tenant location details, branches, phone, and service images."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260629_07"
down_revision: str | None = "20260629_06"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("country_code", sa.String(length=2), nullable=True))
    op.add_column("tenants", sa.Column("state", sa.String(length=120), nullable=True))
    op.add_column("tenants", sa.Column("address_line", sa.String(length=300), nullable=True))
    op.add_column("tenants", sa.Column("phone_country_code", sa.String(length=8), nullable=True))
    op.add_column("tenants", sa.Column("phone_number", sa.String(length=30), nullable=True))
    op.add_column("tenants", sa.Column("latitude", sa.Numeric(10, 7), nullable=True))
    op.add_column("tenants", sa.Column("longitude", sa.Numeric(10, 7), nullable=True))
    op.add_column("tenants", sa.Column("branches", sa.JSON(), nullable=False, server_default="[]"))
    op.alter_column("tenants", "branches", server_default=None)
    op.add_column("services", sa.Column("image_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("services", "image_url")
    op.drop_column("tenants", "branches")
    op.drop_column("tenants", "longitude")
    op.drop_column("tenants", "latitude")
    op.drop_column("tenants", "phone_number")
    op.drop_column("tenants", "phone_country_code")
    op.drop_column("tenants", "address_line")
    op.drop_column("tenants", "state")
    op.drop_column("tenants", "country_code")
