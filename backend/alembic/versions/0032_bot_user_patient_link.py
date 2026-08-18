"""Link a bot user to a specific patient card.

Когда по одному номеру телефона в базе несколько пациентов (родитель/ребёнок,
номер друга), бот уточняет, кто именно имеется в виду, и сохраняет выбор в
bot_users.patient_id — чтобы не переспрашивать и знать, чей номер менять.

Revision ID: 0032_bot_user_patient_link
Revises: 0031_doctor_profiles
Create Date: 2026-08-18
"""

from alembic import op

revision = "0032_bot_user_patient_link"
down_revision = "0031_doctor_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS patient_id UUID NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE bot_users DROP COLUMN IF EXISTS patient_id")
