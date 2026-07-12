"""Add TTS voice/role/speed to AI-calling campaigns

Revision ID: 0022_campaign_tts_voice
Revises: 0021_ai_calling_campaigns
Create Date: 2026-07-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0022_campaign_tts_voice"
down_revision = "0021_ai_calling_campaigns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_calling_campaigns", sa.Column("tts_voice", sa.String(50), nullable=True))
    op.add_column("ai_calling_campaigns", sa.Column("tts_role", sa.String(50), nullable=True))
    op.add_column("ai_calling_campaigns", sa.Column("tts_speed", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_calling_campaigns", "tts_speed")
    op.drop_column("ai_calling_campaigns", "tts_role")
    op.drop_column("ai_calling_campaigns", "tts_voice")
