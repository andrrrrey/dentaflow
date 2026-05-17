"""Create bot_users table for tracking bot channel users.

Revision ID: 0015_bot_users
Revises: 0014_bot_reminders
Create Date: 2026-05-17
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0015_bot_users"
down_revision = "0014_bot_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bot_users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("chat_id", sa.String(100), nullable=False),
        sa.Column("user_id", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("channel", "user_id", name="uq_bot_users_channel_user_id"),
    )
    op.create_index("ix_bot_users_phone", "bot_users", ["phone"])


def downgrade() -> None:
    op.drop_index("ix_bot_users_phone", table_name="bot_users")
    op.drop_table("bot_users")
