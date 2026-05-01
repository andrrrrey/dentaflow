"""add gender to patients

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("gender", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("patients", "gender")
