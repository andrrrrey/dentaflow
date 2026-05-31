"""Add auto call task fields and admin_points table

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0017_auto_call_tasks_and_rewards"
down_revision = "0016_bot_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extend tasks table with 4 new columns
    op.add_column("tasks", sa.Column("is_auto", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("tasks", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column(
        "tasks",
        sa.Column(
            "appointment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("appointments.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "tasks",
        sa.Column(
            "completed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_tasks_is_auto", "tasks", ["is_auto"])
    op.create_index("ix_tasks_is_active", "tasks", ["is_active"])

    # New admin_points table (points ledger)
    op.create_table(
        "admin_points",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("admin_points")
    op.drop_index("ix_tasks_is_active", table_name="tasks")
    op.drop_index("ix_tasks_is_auto", table_name="tasks")
    op.drop_column("tasks", "completed_by")
    op.drop_column("tasks", "appointment_id")
    op.drop_column("tasks", "is_active")
    op.drop_column("tasks", "is_auto")
