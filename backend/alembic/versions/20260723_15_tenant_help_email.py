"""Add tenant help_email for public booking contact."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_15"
down_revision: str | None = "20260720_14"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("help_email", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "help_email")
