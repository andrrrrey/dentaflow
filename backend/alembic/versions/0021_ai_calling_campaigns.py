"""AI-calling campaigns and per-patient call items

Revision ID: 0021_ai_calling_campaigns
Revises: 0020_missed_consult_desc
Create Date: 2026-06-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0021_ai_calling_campaigns"
down_revision = "0020_missed_consult_desc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_calling_campaigns",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("segment_key", sa.String(50), nullable=False),
        sa.Column("scenario_id", sa.String(100), nullable=False, server_default="default"),
        sa.Column("status", sa.String(20), nullable=False, server_default="scheduled"),
        sa.Column("max_concurrent", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("window_start", sa.String(5), nullable=True),
        sa.Column("window_end", sa.String(5), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Europe/Moscow"),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("succeeded", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ai_calling_campaigns_status", "ai_calling_campaigns", ["status"])

    op.create_table(
        "ai_calling_campaign_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "campaign_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ai_calling_campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("patient_id", UUID(as_uuid=True), sa.ForeignKey("patients.id"), nullable=True),
        sa.Column("phone", sa.String(50), nullable=False),
        sa.Column("call_id", sa.String(64), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("outcome", sa.String(30), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("duration_sec", sa.Integer(), nullable=True),
        sa.Column("comm_id", UUID(as_uuid=True), sa.ForeignKey("communications.id"), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_ai_calling_campaign_items_campaign_id", "ai_calling_campaign_items", ["campaign_id"]
    )
    op.create_index(
        "ix_ai_calling_campaign_items_patient_id", "ai_calling_campaign_items", ["patient_id"]
    )
    op.create_index(
        "ix_ai_calling_campaign_items_status", "ai_calling_campaign_items", ["status"]
    )


def downgrade() -> None:
    op.drop_table("ai_calling_campaign_items")
    op.drop_table("ai_calling_campaigns")
