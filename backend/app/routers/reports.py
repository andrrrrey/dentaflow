"""Reports — aggregated analytics from local DB."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import User

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


def _default_range(
    date_from: date | None, date_to: date | None
) -> tuple[datetime, datetime]:
    if date_to is None:
        date_to = date.today()
    if date_from is None:
        date_from = date_to - timedelta(days=30)
    dt_from = datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc)
    dt_to = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)
    return dt_from, dt_to


@router.get("/revenue")
async def revenue_report(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    dt_from, dt_to = _default_range(date_from, date_to)

    stmt = (
        select(
            cast(Appointment.scheduled_at, Date).label("day"),
            func.sum(Appointment.revenue).label("revenue"),
            func.count().label("count"),
        )
        .where(Appointment.scheduled_at >= dt_from, Appointment.scheduled_at <= dt_to)
        .group_by("day")
        .order_by("day")
    )
    result = await db.execute(stmt)
    rows = result.all()

    total_revenue = sum(float(r.revenue or 0) for r in rows)
    total_appointments = sum(r.count for r in rows)

    # Conversion: arrived/completed vs total appointments in period
    arrived = (await db.execute(
        select(func.count()).where(
            Appointment.scheduled_at >= dt_from,
            Appointment.scheduled_at <= dt_to,
            Appointment.status.in_(["arrived", "completed"]),
        )
    )).scalar() or 0
    conversion_rate = round(arrived / total_appointments * 100, 1) if total_appointments else 0

    return {
        "total_revenue": total_revenue,
        "total_appointments": total_appointments,
        "conversion_rate": conversion_rate,
        "by_day": [
            {"date": str(r.day), "revenue": float(r.revenue or 0), "count": r.count}
            for r in rows
        ],
    }


@router.get("/patients")
async def patients_report(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    dt_from, dt_to = _default_range(date_from, date_to)

    total_stmt = select(func.count()).select_from(Patient)
    total = (await db.execute(total_stmt)).scalar() or 0

    # New patients: those who had their first appointment in this period
    # (is_new_patient flag set by 1Denta, visit in period)
    new_stmt = (
        select(func.count(func.distinct(Appointment.patient_id)))
        .select_from(Appointment)
        .join(Patient, Appointment.patient_id == Patient.id)
        .where(
            Appointment.scheduled_at >= dt_from,
            Appointment.scheduled_at <= dt_to,
            Patient.is_new_patient == True,
        )
    )
    new_patients = (await db.execute(new_stmt)).scalar() or 0

    # Returning patients: visited in period and not flagged as new
    returning_stmt = (
        select(func.count(func.distinct(Appointment.patient_id)))
        .select_from(Appointment)
        .join(Patient, Appointment.patient_id == Patient.id)
        .where(
            Appointment.scheduled_at >= dt_from,
            Appointment.scheduled_at <= dt_to,
            Patient.is_new_patient == False,
        )
    )
    returning = (await db.execute(returning_stmt)).scalar() or 0

    return {
        "total_patients": total,
        "new_patients": new_patients,
        "returning_patients": returning,
    }


@router.get("/services")
async def services_report(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    dt_from, dt_to = _default_range(date_from, date_to)

    stmt = (
        select(
            Appointment.service,
            func.count().label("count"),
            func.sum(Appointment.revenue).label("revenue"),
        )
        .where(
            Appointment.scheduled_at >= dt_from,
            Appointment.scheduled_at <= dt_to,
            Appointment.service.isnot(None),
        )
        .group_by(Appointment.service)
        .order_by(func.count().desc())
        .limit(20)
    )
    result = await db.execute(stmt)
    rows = result.all()

    return {
        "services": [
            {"service": r.service, "count": r.count, "revenue": float(r.revenue or 0)}
            for r in rows
        ],
    }


@router.get("/doctors")
async def doctors_report(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    dt_from, dt_to = _default_range(date_from, date_to)

    stmt = (
        select(
            Appointment.doctor_name,
            func.count().label("count"),
            func.sum(Appointment.revenue).label("revenue"),
            func.sum(
                case((Appointment.status == "completed", 1), else_=0)
            ).label("completed"),
        )
        .where(
            Appointment.scheduled_at >= dt_from,
            Appointment.scheduled_at <= dt_to,
            Appointment.doctor_name.isnot(None),
        )
        .group_by(Appointment.doctor_name)
        .order_by(func.sum(Appointment.revenue).desc())
        .limit(20)
    )
    result = await db.execute(stmt)
    rows = result.all()

    return {
        "doctors": [
            {
                "doctor_name": r.doctor_name,
                "count": r.count,
                "revenue": float(r.revenue or 0),
                "completed": r.completed,
            }
            for r in rows
        ],
    }
