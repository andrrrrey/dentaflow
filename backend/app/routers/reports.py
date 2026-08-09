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


@router.get("/sources")
async def sources_report(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Источники обращений: сколько пациентов пришло из каждого источника
    привлечения (``referral_source``) за период (по дате появления пациента).
    """
    dt_from, dt_to = _default_range(date_from, date_to)

    stmt = (
        select(
            Patient.referral_source.label("source"),
            func.count().label("count"),
        )
        .where(Patient.created_at >= dt_from, Patient.created_at <= dt_to)
        .group_by(Patient.referral_source)
        .order_by(func.count().desc())
    )
    rows = (await db.execute(stmt)).all()

    items = []
    total = 0
    for r in rows:
        cnt = int(r.count or 0)
        total += cnt
        items.append({"source": r.source or "Не указан", "count": cnt})

    return {"total": total, "sources": items}


@router.get("/primary-patients")
async def primary_patients_report(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Показатели по первичным пациентам за период.

    Первичный пациент — тот, чей самый ранний визит (min ``scheduled_at``)
    приходится на выбранный период. Делим на взрослых (18+) и детей (<18) по
    ``birth_date`` и отдаём разбивку по дням для графика.
    """
    dt_from, dt_to = _default_range(date_from, date_to)

    # Самый ранний визит каждого пациента
    first_visit = (
        select(
            Appointment.patient_id.label("patient_id"),
            func.min(Appointment.scheduled_at).label("first_at"),
        )
        .where(Appointment.patient_id.isnot(None))
        .group_by(Appointment.patient_id)
        .subquery()
    )

    stmt = (
        select(
            cast(first_visit.c.first_at, Date).label("day"),
            Patient.birth_date,
        )
        .join(Patient, Patient.id == first_visit.c.patient_id)
        .where(
            first_visit.c.first_at >= dt_from,
            first_visit.c.first_at <= dt_to,
        )
    )
    rows = (await db.execute(stmt)).all()

    today = date.today()

    def _is_child(bd: date | None) -> bool:
        if bd is None:
            return False
        age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
        return age < 18

    adults = 0
    children = 0
    by_day: dict[str, dict[str, int]] = {}
    for r in rows:
        child = _is_child(r.birth_date)
        if child:
            children += 1
        else:
            adults += 1
        key = str(r.day)
        bucket = by_day.setdefault(key, {"adults": 0, "children": 0})
        if child:
            bucket["children"] += 1
        else:
            bucket["adults"] += 1

    by_day_list = [
        {"date": k, "adults": v["adults"], "children": v["children"], "total": v["adults"] + v["children"]}
        for k, v in sorted(by_day.items())
    ]

    return {
        "total": adults + children,
        "adults": adults,
        "children": children,
        "by_day": by_day_list,
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
