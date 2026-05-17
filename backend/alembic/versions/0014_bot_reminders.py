"""Create bot_reminders table for appointment notifications.

Revision ID: 0014_bot_reminders
Revises: 0013_extend_external_id
Create Date: 2026-05-17
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0014_bot_reminders"
down_revision = "0013_extend_external_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bot_reminders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("chat_id", sa.String(100), nullable=False),
        sa.Column("user_id", sa.String(100), nullable=False),
        sa.Column("patient_name", sa.String(255), nullable=True),
        sa.Column("patient_phone", sa.String(50), nullable=True),
        sa.Column("service_name", sa.String(255), nullable=True),
        sa.Column("doctor_name", sa.String(255), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("one_denta_visit_id", sa.String(100), nullable=True),
        sa.Column("service_id", sa.String(100), nullable=True),
        sa.Column("doctor_id", sa.String(100), nullable=True),
        sa.Column("remind_sent", sa.Boolean(), default=False, nullable=False, server_default="false"),
        sa.Column("cancelled", sa.Boolean(), default=False, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_bot_reminders_scheduled_at", "bot_reminders", ["scheduled_at"])


def downgrade() -> None:
    op.drop_index("ix_bot_reminders_scheduled_at", table_name="bot_reminders")
    op.drop_table("bot_reminders")
