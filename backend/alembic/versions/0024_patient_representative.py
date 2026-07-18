"""Add parent/representative fields to patients (manual entry — 1Denta API
does not expose guardian data)

Revision ID: 0024_patient_representative
Revises: 0023_communications_last_message_at
Create Date: 2026-07-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0024_patient_representative"
down_revision = "0023_communications_last_message_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("representative_name", sa.String(255), nullable=True))
    op.add_column("patients", sa.Column("representative_phone", sa.String(50), nullable=True))
    op.add_column("patients", sa.Column("representative_relation", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("patients", "representative_relation")
    op.drop_column("patients", "representative_phone")
    op.drop_column("patients", "representative_name")
