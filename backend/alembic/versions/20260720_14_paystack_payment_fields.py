"""Paystack payment fields on tenants and payment_transactions."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260720_14"
down_revision: str | None = "20260715_13"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("paystack_subaccount_id", sa.String(length=80), nullable=True))
    op.add_column("tenants", sa.Column("settlement_bank_code", sa.String(length=20), nullable=True))
    op.add_column("tenants", sa.Column("settlement_account_last4", sa.String(length=4), nullable=True))
    op.add_column("tenants", sa.Column("platform_fee_percent", sa.Numeric(5, 2), nullable=True))

    op.add_column("payment_transactions", sa.Column("currency", sa.String(length=3), nullable=False, server_default="NGN"))
    op.add_column("payment_transactions", sa.Column("platform_fee_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("payment_transactions", sa.Column("tenant_settlement_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column(
        "payment_transactions",
        sa.Column("purpose", sa.String(length=40), nullable=False, server_default="booking"),
    )
    op.add_column("payment_transactions", sa.Column("authorization_url", sa.String(length=500), nullable=True))
    op.add_column("payment_transactions", sa.Column("access_code", sa.String(length=120), nullable=True))
    op.add_column("payment_transactions", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))

    # Allow subscription payments without a booking.
    with op.batch_alter_table("payment_transactions") as batch:
        batch.alter_column("booking_id", existing_type=sa.String(length=36), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("payment_transactions") as batch:
        batch.alter_column("booking_id", existing_type=sa.String(length=36), nullable=False)

    op.drop_column("payment_transactions", "paid_at")
    op.drop_column("payment_transactions", "access_code")
    op.drop_column("payment_transactions", "authorization_url")
    op.drop_column("payment_transactions", "purpose")
    op.drop_column("payment_transactions", "tenant_settlement_amount")
    op.drop_column("payment_transactions", "platform_fee_amount")
    op.drop_column("payment_transactions", "currency")

    op.drop_column("tenants", "platform_fee_percent")
    op.drop_column("tenants", "settlement_account_last4")
    op.drop_column("tenants", "settlement_bank_code")
    op.drop_column("tenants", "paystack_subaccount_id")
