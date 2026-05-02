"""add directory_cache table

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "directory_cache",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=True),
        sa.Column("name", sa.String(300), nullable=False, server_default=""),
        sa.Column("data", JSON, nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("category", "external_id", name="uq_directory_cache_category_ext_id"),
    )
    op.create_index("ix_directory_cache_category", "directory_cache", ["category"])


def downgrade() -> None:
    op.drop_index("ix_directory_cache_category", "directory_cache")
    op.drop_table("directory_cache")
