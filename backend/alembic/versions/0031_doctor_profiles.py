"""Create doctor_profiles table (birth_date + work schedule per doctor).

Локальный профиль врача поверх справочника 1Denta: дата рождения (для
напоминаний) и график работы (недельный + исключения по датам), который
учитывается при создании записей в расписании.

Revision ID: 0031_doctor_profiles
Revises: 0030_staff_birthday_optional_auth
Create Date: 2026-08-18
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSON, UUID

revision = "0031_doctor_profiles"
down_revision = "0030_staff_birthday_optional_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "doctor_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("doctor_id", sa.String(100), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("weekly_hours", JSON, nullable=True),
        sa.Column("schedule_exceptions", JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("doctor_id", name="uq_doctor_profiles_doctor_id"),
    )


def downgrade() -> None:
    op.drop_table("doctor_profiles")
