"""Schedule / appointments router.

Returns appointments from the local DB (synced from 1Denta every 5 minutes).
Supports filtering by date, doctor and status.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import User

router = APIRouter(prefix="/api/v1/schedule", tags=["schedule"])


@router.get("/")
async def list_schedule(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    doctor: str | None = Query(None, description="Filter by doctor name (partial match)"),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return appointments for the given date range."""
    if date_from is None:
        date_from = date.today()
    if date_to is None:
        date_to = date_from + timedelta(days=7)

    dt_from = datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc)
    dt_to = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)

    stmt = (
        select(Appointment, Patient.name.label("patient_name"), Patient.phone.label("patient_phone"))
        .outerjoin(Patient, Appointment.patient_id == Patient.id)
        .where(Appointment.scheduled_at >= dt_from, Appointment.scheduled_at <= dt_to)
        .order_by(Appointment.scheduled_at)
    )

    if doctor:
        stmt = stmt.where(Appointment.doctor_name.ilike(f"%{doctor}%"))
    if status:
        stmt = stmt.where(Appointment.status == status)

    result = await db.execute(stmt)
    rows = result.all()

    appointments = []
    for row in rows:
        appt = row.Appointment
        appointments.append({
            "id": str(appt.id),
            "external_id": appt.external_id,
            "patient_id": str(appt.patient_id) if appt.patient_id else None,
            "patient_name": row.patient_name or "Неизвестный пациент",
            "patient_phone": row.patient_phone,
            "doctor_name": appt.doctor_name,
            "doctor_id": appt.doctor_id,
            "service": appt.service,
            "branch": appt.branch,
            "scheduled_at": appt.scheduled_at.isoformat() if appt.scheduled_at else None,
            "duration_min": appt.duration_min,
            "status": appt.status,
            "revenue": float(appt.revenue) if appt.revenue else 0,
        })

    total = len(appointments)
    confirmed = sum(1 for a in appointments if a["status"] == "confirmed")
    cancelled = sum(1 for a in appointments if a["status"] == "cancelled")

    return {
        "appointments": appointments,
        "stats": {
            "total": total,
            "confirmed": confirmed,
            "cancelled": cancelled,
            "completion_rate": round(confirmed / total * 100) if total else 0,
        },
    }
