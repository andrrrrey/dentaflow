"""Add cached AI analysis columns to patients table

Revision ID: 0018_patient_ai_analysis_cache
Revises: 0017_auto_call_tasks_and_rewards
Create Date: 2026-06-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0018_patient_ai_analysis_cache"
down_revision = "0017_auto_call_tasks_and_rewards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("ai_analysis", JSONB(), nullable=True))
    op.add_column(
        "patients",
        sa.Column("ai_analysis_fingerprint", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "patients",
        sa.Column("ai_analysis_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("patients", "ai_analysis_at")
    op.drop_column("patients", "ai_analysis_fingerprint")
    op.drop_column("patients", "ai_analysis")
