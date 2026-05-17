"""Extend communications.external_id from VARCHAR(100) to VARCHAR(512)

Max messenger callback_id values exceed 100 characters.

Revision ID: 0013_extend_external_id
Revises: 0012_add_comment_to_patients
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_extend_external_id"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "communications",
        "external_id",
        existing_type=sa.String(100),
        type_=sa.String(512),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "communications",
        "external_id",
        existing_type=sa.String(512),
        type_=sa.String(100),
        existing_nullable=True,
    )
