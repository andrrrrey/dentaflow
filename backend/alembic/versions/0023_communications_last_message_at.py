"""Add communications.last_message_at for chat-thread ordering

Revision ID: 0023_comm_last_message_at
Revises: 0022_campaign_tts_voice
Create Date: 2026-07-18

NOTE: revision id must stay <= 32 chars — alembic_version.version_num is
VARCHAR(32); the original longer id failed to apply on production.
"""

from alembic import op

revision = "0023_comm_last_message_at"
down_revision = "0022_campaign_tts_voice"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS — safe to re-run after a partially failed deploy
    op.execute(
        "ALTER TABLE communications ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ NULL"
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
          AND c.last_message_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE communications DROP COLUMN IF EXISTS last_message_at")
