"""ИИ-обзвон: кампании и их элементы (по одному звонку на пациента).

Кампания обзвона = сегмент пациентов + сценарий + расписание/окна. Оркестратор
(Celery) ставит звонки через Asterisk (AMI) и заворачивает их в aicallrobot.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class AiCallingCampaign(Base):
    __tablename__ = "ai_calling_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Аудитория — сохранённый сегмент пациентов.
    segment_key: Mapped[str] = mapped_column(String(50), nullable=False)
    scenario_id: Mapped[str] = mapped_column(String(100), default="default")
    status: Mapped[str] = mapped_column(
        String(20), default="scheduled", index=True
    )  # scheduled|running|waiting_window|paused|completed|cancelled|failed
    # Сколько звонков вести одновременно (≤ лимита каналов тарифа Novofon).
    max_concurrent: Mapped[int] = mapped_column(Integer, default=1)
    # Расписание и окна обзвона.
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    window_start: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "09:00"
    window_end: Mapped[str | None] = mapped_column(String(5), nullable=True)    # "20:00"
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Moscow")
    # Голос TTS для звонков кампании (голос/амплуа/скорость).
    tts_voice: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tts_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tts_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Счётчики прогресса.
    total: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[int] = mapped_column(Integer, default=0)
    succeeded: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AiCallingCampaignItem(Base):
    __tablename__ = "ai_calling_campaign_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_calling_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id"), nullable=True, index=True
    )
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    # call_id, выданный aicallrobot (он же UUID для AudioSocket).
    call_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="pending", index=True
    )  # pending|calling|done|no_answer|failed|cancelled
    outcome: Mapped[str | None] = mapped_column(String(30), nullable=True)  # client_status
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comm_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("communications.id"), nullable=True
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
