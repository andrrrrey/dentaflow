"""Update 'Несостоявшиеся консультации' segment description

The segment now covers all clients who never attended any visit (never
scheduled, or scheduled but never showed up), not only missed first
consultations. Refresh the seeded description on existing installs.

Revision ID: 0020_missed_consult_desc
Revises: 0019_patient_segments
Create Date: 2026-06-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_missed_consult_desc"
down_revision = "0019_patient_segments"
branch_labels = None
depends_on = None

_NEW = (
    "Клиенты из базы, которые так и не дошли до клиники: не записывались "
    "либо были записаны, но не пришли ни на один приём."
)
_OLD = (
    "ИИ-анализ карточки 1Denta: пациент был записан на первичную "
    "консультацию, но не посетил её."
)


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE patient_segments SET description = :d WHERE key = 'missed_consultation'"
        ).bindparams(d=_NEW)
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE patient_segments SET description = :d WHERE key = 'missed_consultation'"
        ).bindparams(d=_OLD)
    )
