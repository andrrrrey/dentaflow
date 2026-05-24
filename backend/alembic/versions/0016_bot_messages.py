"""Add bot_messages table and bot_chat_id/bot_channel_uid to communications

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("communications", sa.Column("bot_chat_id", sa.String(100), nullable=True))
    op.add_column("communications", sa.Column("bot_channel_uid", sa.String(100), nullable=True))

    op.create_table(
        "bot_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "communication_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("communications.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("sender_name", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("bot_messages")
    op.drop_column("communications", "bot_channel_uid")
    op.drop_column("communications", "bot_chat_id")
