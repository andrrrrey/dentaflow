"""Patient segments (saved lists) + AI treatment-analysis cache columns

Revision ID: 0019_patient_segments
Revises: 0018_patient_ai_analysis_cache
Create Date: 2026-06-14
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0019_patient_segments"
down_revision = "0018_patient_ai_analysis_cache"
branch_labels = None
depends_on = None


_SEED_SEGMENTS = [
    (
        "unfinished_treatment",
        "Незавершённые планы лечения",
        "ИИ-анализ карточки 1Denta: пациент был на услугах лечения, но не завершил план и нет записей на продолжение.",
        "dynamic_ai",
    ),
    (
        "hygiene_due",
        "Нужна гигиена 6+ мес",
        "ИИ-анализ карточки 1Denta: последняя профессиональная гигиена была более 6 месяцев назад.",
        "dynamic_ai",
    ),
    (
        "missed_consultation",
        "Несостоявшиеся консультации",
        "ИИ-анализ карточки 1Denta: пациент был записан на первичную консультацию, но не посетил её.",
        "dynamic_ai",
    ),
    (
        "do_not_touch",
        "Не трогать",
        "Ручной список пациентов, которых не нужно включать в обзвоны и рассылки. Исключается из остальных списков.",
        "manual",
    ),
]


def upgrade() -> None:
    # --- AI treatment-analysis cache columns on patients ---
    op.add_column("patients", sa.Column("treatment_ai", JSONB(), nullable=True))
    op.add_column(
        "patients",
        sa.Column("treatment_ai_fingerprint", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "patients",
        sa.Column("treatment_ai_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- patient_segments ---
    segments = op.create_table(
        "patient_segments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="dynamic_sql"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="idle"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("member_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("key", name="uq_patient_segments_key"),
    )

    # --- patient_segment_members ---
    op.create_table(
        "patient_segment_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "segment_id",
            UUID(as_uuid=True),
            sa.ForeignKey("patient_segments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "patient_id",
            UUID(as_uuid=True),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("segment_id", "patient_id", name="uq_segment_patient"),
    )
    op.create_index(
        "ix_patient_segment_members_segment_id", "patient_segment_members", ["segment_id"]
    )
    op.create_index(
        "ix_patient_segment_members_patient_id", "patient_segment_members", ["patient_id"]
    )

    # --- Seed the four predefined segments ---
    op.bulk_insert(
        segments,
        [
            {
                "id": uuid.uuid4(),
                "key": key,
                "name": name,
                "description": description,
                "kind": kind,
                "status": "idle",
                "progress": 0,
                "processed": 0,
                "total": 0,
                "member_count": 0,
            }
            for key, name, description, kind in _SEED_SEGMENTS
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_patient_segment_members_patient_id", "patient_segment_members")
    op.drop_index("ix_patient_segment_members_segment_id", "patient_segment_members")
    op.drop_table("patient_segment_members")
    op.drop_table("patient_segments")
    op.drop_column("patients", "treatment_ai_at")
    op.drop_column("patients", "treatment_ai_fingerprint")
    op.drop_column("patients", "treatment_ai")
