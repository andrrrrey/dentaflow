"""Add birth_date to users and make email / password_hash nullable.

Позволяет заводить сотрудников без возможности авторизации (без пароля и,
при необходимости, без email) и хранить дату рождения для напоминаний.

Revision ID: 0030_staff_birthday_optional_auth
Revises: 0029_bot_user_name
Create Date: 2026-08-18
"""

from alembic import op

revision = "0030_staff_birthday_optional_auth"
down_revision = "0029_bot_user_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE NULL")
    op.execute("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL")
    op.execute("ALTER TABLE users ALTER COLUMN email DROP NOT NULL")


def downgrade() -> None:
    # Восстановление NOT NULL небезопасно при наличии NULL-строк — оставляем
    # столбцы nullable и лишь удаляем birth_date.
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS birth_date")
