"""Add contact name to bot_users so bots can remember the user.

``name`` — имя, которое пользователь ввёл в сценарии бота (запись/менеджер).
Позволяет не переспрашивать имя и телефон при повторном обращении.

Revision ID: 0029_bot_user_name
Revises: 0028_patient_referral_source
Create Date: 2026-08-10
"""

from alembic import op

revision = "0029_bot_user_name"
down_revision = "0028_patient_referral_source"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS name VARCHAR(200) NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE bot_users DROP COLUMN IF EXISTS name")
