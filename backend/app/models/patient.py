import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Integer, Numeric, String, Boolean, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    external_id: Mapped[str | None] = mapped_column(
        String(100), unique=True, nullable=True
    )  # ID в 1Denta
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_channel: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # telegram|call|site|max|referral
    is_new_patient: Mapped[bool] = mapped_column(Boolean, default=True)
    last_visit_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    total_revenue: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0
    )
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)  # male|female
    patient_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # new|regular|refused|potential|noGroup
    ltv_score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # AI LTV 0-100
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Родитель / законный представитель (для детей). Заполняется вручную в
    # DentaFlow — API 1Denta эти данные не отдаёт.
    representative_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    representative_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    representative_relation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    # Программа лояльности: текущий баланс баллов (кэш суммы loyalty_transactions)
    # и персональный реферальный код пациента (генерируется по запросу из бота).
    bonus_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    referral_code: Mapped[str | None] = mapped_column(
        String(16), unique=True, nullable=True, index=True
    )
    synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    raw_1denta_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Cached "ИИ-Анализ пациента" — regenerated only when the underlying
    # patient/appointment data changes (tracked via ai_analysis_fingerprint).
    ai_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_analysis_fingerprint: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    ai_analysis_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Cached AI verdict for segment analysis (treatment plan completion +
    # first-consultation attendance). Regenerated only when the patient's
    # visit history changes (tracked via treatment_ai_fingerprint).
    treatment_ai: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    treatment_ai_fingerprint: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    treatment_ai_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
