"""Add tts_provider to AI-calling campaigns

Провайдер синтеза речи для кампании обзвона: "yandex" (дефолт) | "fish".
Для fish.audio reference_id голоса хранится в существующей колонке tts_voice.

Revision ID: 0027_campaign_tts_provider
Revises: 0026_appt_duration_manual
Create Date: 2026-08-08
"""

from alembic import op
import sqlalchemy as sa

revision = "0027_campaign_tts_provider"
down_revision = "0026_appt_duration_manual"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_calling_campaigns", sa.Column("tts_provider", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_calling_campaigns", "tts_provider")
