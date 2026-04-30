"""Pipeline funnel and patient-by-stage endpoints.

Calculates patient funnel stages from local DB (synced from 1Denta).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import User

router = APIRouter(prefix="/api/v1/pipeline", tags=["pipeline"])


@router.get("/funnel")
async def pipeline_funnel(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return patient funnel counts for all stages."""
    # Total leads (all patients in DB)
    total_result = await db.execute(select(func.count(Patient.id)))
    total = total_result.scalar_one() or 0

    # Patients with at least one appointment (first contact)
    first_contact_result = await db.execute(
        select(func.count(func.distinct(Appointment.patient_id)))
        .where(Appointment.patient_id.isnot(None))
    )
    first_contact = first_contact_result.scalar_one() or 0

    # Appointments by status
    status_result = await db.execute(
        select(Appointment.status, func.count(Appointment.id))
        .group_by(Appointment.status)
    )
    status_counts: dict[str, int] = {row[0]: row[1] for row in status_result.all() if row[0]}

    confirmed = status_counts.get("confirmed", 0)
    arrived = status_counts.get("arrived", 0) + status_counts.get("completed", 0)
    treatment_started = arrived  # simplification: arrived = treatment started

    def pct(part: int, whole: int) -> int:
        return round(part / whole * 100) if whole else 0

    stages = [
        {"key": "leads", "label": "Обращения", "count": total, "pct": 100},
        {"key": "first_contact", "label": "Первый контакт", "count": first_contact, "pct": pct(first_contact, total)},
        {"key": "scheduled", "label": "Записались", "count": first_contact, "pct": pct(first_contact, total)},
        {"key": "confirmed", "label": "Подтвердили", "count": confirmed, "pct": pct(confirmed, total)},
        {"key": "arrived", "label": "Пришли", "count": arrived, "pct": pct(arrived, total)},
        {"key": "treatment", "label": "Лечение начато", "count": treatment_started, "pct": pct(treatment_started, total)},
    ]

    overall_conversion = pct(treatment_started, total)

    # Lead sources from patient source_channel
    source_result = await db.execute(
        select(Patient.source_channel, func.count(Patient.id))
        .where(Patient.source_channel.isnot(None))
        .group_by(Patient.source_channel)
    )
    sources = []
    for row in source_result.all():
        channel = row[0]
        count = row[1]
        conv = pct(int(count * 0.4), count)  # placeholder; real conversion needs joined data
        sources.append({
            "source": channel,
            "leads": count,
            "conversion": conv,
            "cpl": None,
            "quality": "Хорошо" if conv >= 50 else "Слабый" if conv < 30 else "Средний",
        })

    return {
        "stages": stages,
        "overall_conversion": overall_conversion,
        "sources": sources,
    }


@router.get("/patients")
async def patients_by_stage(
    stage: str = Query(..., description="Funnel stage key"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return patients at a given funnel stage."""
    offset = (page - 1) * limit

    if stage == "leads":
        stmt = select(Patient).offset(offset).limit(limit)
        count_stmt = select(func.count(Patient.id))
    elif stage in ("first_contact", "scheduled"):
        subq = select(func.distinct(Appointment.patient_id)).where(
            Appointment.patient_id.isnot(None)
        )
        stmt = select(Patient).where(Patient.id.in_(subq)).offset(offset).limit(limit)
        count_stmt = select(func.count(Patient.id)).where(Patient.id.in_(subq))
    elif stage == "confirmed":
        subq = select(func.distinct(Appointment.patient_id)).where(
            Appointment.status == "confirmed"
        )
        stmt = select(Patient).where(Patient.id.in_(subq)).offset(offset).limit(limit)
        count_stmt = select(func.count(Patient.id)).where(Patient.id.in_(subq))
    elif stage in ("arrived", "treatment"):
        subq = select(func.distinct(Appointment.patient_id)).where(
            Appointment.status.in_(["arrived", "completed"])
        )
        stmt = select(Patient).where(Patient.id.in_(subq)).offset(offset).limit(limit)
        count_stmt = select(func.count(Patient.id)).where(Patient.id.in_(subq))
    else:
        stmt = select(Patient).offset(offset).limit(limit)
        count_stmt = select(func.count(Patient.id))

    patients_result = await db.execute(stmt)
    total_result = await db.execute(count_stmt)

    patients = patients_result.scalars().all()
    total = total_result.scalar_one() or 0

    return {
        "stage": stage,
        "total": total,
        "page": page,
        "patients": [
            {
                "id": str(p.id),
                "external_id": p.external_id,
                "name": p.name,
                "phone": p.phone,
                "email": p.email,
                "is_new_patient": p.is_new_patient,
                "total_revenue": float(p.total_revenue or 0),
                "tags": p.tags or [],
                "last_visit_at": p.last_visit_at.isoformat() if p.last_visit_at else None,
                "source_channel": p.source_channel,
            }
            for p in patients
        ],
    }
