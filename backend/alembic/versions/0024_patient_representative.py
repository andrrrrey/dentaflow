"""Add parent/representative fields to patients (manual entry — 1Denta API
does not expose guardian data)

Revision ID: 0024_patient_representative
Revises: 0023_comm_last_message_at
Create Date: 2026-07-18
"""

from alembic import op

revision = "0024_patient_representative"
down_revision = "0023_comm_last_message_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS — safe to re-run after a partially failed deploy
    op.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS representative_name VARCHAR(255) NULL")
    op.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS representative_phone VARCHAR(50) NULL")
    op.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS representative_relation VARCHAR(50) NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS representative_relation")
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS representative_phone")
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS representative_name")
