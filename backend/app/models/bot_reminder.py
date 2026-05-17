import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class BotReminder(Base):
    __tablename__ = "bot_reminders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    channel: Mapped[str] = mapped_column(String(20), nullable=False)    # max | telegram
    chat_id: Mapped[str] = mapped_column(String(100), nullable=False)   # Max chat_id or TG chat_id
    user_id: Mapped[str] = mapped_column(String(100), nullable=False)   # bot user identifier

    patient_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    patient_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    service_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    doctor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    one_denta_visit_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    service_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    doctor_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    remind_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
