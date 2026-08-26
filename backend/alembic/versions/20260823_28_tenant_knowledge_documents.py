"""Add tenant_knowledge_documents for AI document uploads.

Revision ID: 20260823_28
Revises: 20260823_27
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_28"
down_revision: str | None = "20260823_27"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenant_knowledge_documents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("storage_url", sa.String(length=500), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_tenant_knowledge_documents_tenant",
        "tenant_knowledge_documents",
        ["tenant_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_tenant_knowledge_documents_tenant", table_name="tenant_knowledge_documents")
    op.drop_table("tenant_knowledge_documents")
