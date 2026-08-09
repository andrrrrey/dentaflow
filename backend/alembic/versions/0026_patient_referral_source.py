"""Add marketing referral source to patients + default source options config.

``referral_source`` — «откуда пациент узнал о клинике» (рекомендации, 2ГИС,
Яндекс Карты, реклама и т.д.). Свободный редактируемый список хранится в
integration_settings под ключом ``patient_sources`` (JSON-массив меток).

Revision ID: 0026_patient_referral_source
Revises: 0025_loyalty_program
Create Date: 2026-08-08
"""

from alembic import op

revision = "0026_patient_referral_source"
down_revision = "0025_loyalty_program"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS — safe to re-run after a partially failed deploy
    op.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS referral_source VARCHAR(100) NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS referral_source")
