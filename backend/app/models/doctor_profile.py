import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class DoctorProfile(Base):
    """Локальный профиль врача поверх справочника 1Denta (directory_cache / resource).

    Врач сам по себе не является строкой в таблице ``users`` — он приходит из
    1Denta и хранится в ``directory_cache`` (``category='resource'``). Эта
    таблица хранит только дополнительные локальные поля, которых нет в 1Denta:
    дату рождения (для напоминаний) и график работы (для проверки записей).

    ``doctor_id`` — внешний id ресурса из 1Denta (совпадает с
    ``Appointment.doctor_id`` и ``directory_cache.external_id``).
    """

    __tablename__ = "doctor_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    doctor_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # {"0": {"start": "09:00", "end": "18:00", "break_start": "13:00"|null,
    #        "break_end": "14:00"|null}, ...} — ключ = день недели 0..6 (Пн..Вс).
    # Отсутствие ключа = выходной. Пустой объект = график не задан (без ограничений).
    weekly_hours: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # [{"date": "YYYY-MM-DD", "off": true} | {"date", "start", "end",
    #   "break_start"?, "break_end"?}] — исключения на конкретные даты.
    schedule_exceptions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
