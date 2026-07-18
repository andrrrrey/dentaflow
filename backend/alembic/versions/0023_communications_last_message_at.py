"""Add communications.last_message_at for chat-thread ordering

Revision ID: 0023_communications_last_message_at
Revises: 0022_campaign_tts_voice
Create Date: 2026-07-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0023_communications_last_message_at"
down_revision = "0022_campaign_tts_voice"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "communications",
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill from the latest bot message of each thread
    op.execute(
        """
        UPDATE communications c
        SET last_message_at = m.max_created
        FROM (
            SELECT communication_id, MAX(created_at) AS max_created
            FROM bot_messages
            GROUP BY communication_id
        ) m
        WHERE m.communication_id = c.id
        """
    )


def downgrade() -> None:
    op.drop_column("communications", "last_message_at")
