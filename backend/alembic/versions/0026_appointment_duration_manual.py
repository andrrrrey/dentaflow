"""Appointment.duration_manual — флаг ручной длительности приёма.

Когда длительность задана вручную в DentaFlow, синхронизация 1Denta не
перезаписывает её (в 1Denta длительность визита определяется услугами и не
редактируется через API визита — PUT /api/v2/visit меняет только comment и
datetime).

Revision ID: 0026_appt_duration_manual
Revises: 0025_loyalty_program
Create Date: 2026-08-07
"""

from alembic import op

revision = "0026_appt_duration_manual"
down_revision = "0025_loyalty_program"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE appointments "
        "ADD COLUMN IF NOT EXISTS duration_manual BOOLEAN NOT NULL DEFAULT false"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE appointments DROP COLUMN IF EXISTS duration_manual")
