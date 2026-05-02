"""Doctors / resources router.

Returns doctor list with workload calculated from local appointments DB.
In production mode also fetches resource list from 1Denta for enrichment.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.appointment import Appointment
from app.models.user import User

router = APIRouter(prefix="/api/v1/doctors", tags=["doctors"])


@router.get("/")
async def list_doctors(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return distinct doctors extracted from appointments."""
    today = date.today()
    dt_from = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    dt_to = dt_from + timedelta(days=1)

    stmt = (
        select(
            Appointment.doctor_name,
            Appointment.doctor_id,
            func.count(Appointment.id).label("appointments_today"),
        )
        .where(Appointment.scheduled_at >= dt_from, Appointment.scheduled_at < dt_to)
        .where(Appointment.doctor_name.isnot(None))
        .group_by(Appointment.doctor_name, Appointment.doctor_id)
        .order_by(Appointment.doctor_name)
    )

    result = await db.execute(stmt)
    rows = result.all()

    doctors = [
        {
            "doctor_id": row.doctor_id,
            "doctor_name": row.doctor_name,
            "appointments_today": row.appointments_today,
        }
        for row in rows
    ]
    return {"doctors": doctors}


@router.get("/load")
async def doctors_load(
    target_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return doctor workload with load percentage for the given day."""
    if target_date is None:
        target_date = date.today()

    # Max working slots per doctor per day (08:00–20:00 at 30-min slots)
    MAX_SLOTS = 24

    async def _query_doctors(dt_from: datetime, dt_to: datetime, slots: int):
        stmt = (
            select(
                Appointment.doctor_name,
                Appointment.doctor_id,
                func.count(Appointment.id).label("count"),
                func.sum(Appointment.revenue).label("revenue"),
            )
            .where(
                Appointment.scheduled_at >= dt_from,
                Appointment.scheduled_at < dt_to,
                Appointment.status.notin_(["cancelled"]),
            )
            .where(Appointment.doctor_name.isnot(None))
            .group_by(Appointment.doctor_name, Appointment.doctor_id)
            .order_by(func.count(Appointment.id).desc())
        )
        result = await db.execute(stmt)
        rows = result.all()
        doctors = []
        for row in rows:
            load_pct = min(round(row.count / slots * 100), 100)
            doctors.append({
                "doctor_id": row.doctor_id,
                "doctor_name": row.doctor_name,
                "appointments": row.count,
                "max_slots": slots,
                "load_pct": load_pct,
                "revenue": float(row.revenue or 0),
                "status": "overloaded" if load_pct >= 90 else "busy" if load_pct >= 70 else "normal",
            })
        return doctors

    dt_from = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
    dt_to = dt_from + timedelta(days=1)
    doctors = await _query_doctors(dt_from, dt_to, MAX_SLOTS)

    # Fallback: if no data for today, try current week
    if not doctors:
        week_start = target_date - timedelta(days=target_date.weekday())
        wk_from = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
        wk_to = wk_from + timedelta(days=7)
        doctors = await _query_doctors(wk_from, wk_to, MAX_SLOTS * 5)

    return {"date": target_date.isoformat(), "doctors": doctors}
