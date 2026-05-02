"""Add patient_type to patients and comment to appointments

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("patient_type", sa.String(50), nullable=True))
    op.add_column("appointments", sa.Column("comment", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("patients", "patient_type")
    op.drop_column("appointments", "comment")
