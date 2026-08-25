"""Add AI knowledge, FAQ, and tenant policy fields.

Revision ID: 20260823_27
Revises: 20260819_26
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_27"
down_revision: str | None = "20260819_26"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("cancellation_policy", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("booking_policies", sa.Text(), nullable=True))

    op.create_table(
        "tenant_faqs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("question", sa.String(length=500), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tenant_faqs_tenant_id", "tenant_faqs", ["tenant_id"])

    op.create_table(
        "ai_knowledge_chunks",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_knowledge_chunks_tenant_id", "ai_knowledge_chunks", ["tenant_id"])
    op.create_index(
        "ix_ai_knowledge_chunks_tenant_source",
        "ai_knowledge_chunks",
        ["tenant_id", "source"],
    )

    # Best-effort pgvector column for Postgres. Skip silently on SQLite / missing extension.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        op.execute("ALTER TABLE ai_knowledge_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)")
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_ai_knowledge_chunks_embedding
            ON ai_knowledge_chunks
            USING hnsw (embedding vector_cosine_ops)
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_ai_knowledge_chunks_embedding")
        op.execute("ALTER TABLE ai_knowledge_chunks DROP COLUMN IF EXISTS embedding")
    op.drop_index("ix_ai_knowledge_chunks_tenant_source", table_name="ai_knowledge_chunks")
    op.drop_index("ix_ai_knowledge_chunks_tenant_id", table_name="ai_knowledge_chunks")
    op.drop_table("ai_knowledge_chunks")
    op.drop_index("ix_tenant_faqs_tenant_id", table_name="tenant_faqs")
    op.drop_table("tenant_faqs")
    op.drop_column("tenants", "booking_policies")
    op.drop_column("tenants", "cancellation_policy")
