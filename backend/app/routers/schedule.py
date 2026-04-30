"""Schedule / appointments router.

Returns appointments from the local DB (synced from 1Denta every 5 minutes).
Supports filtering by date, doctor and status.
Also allows creating new appointments via 1Denta API.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import User
from app.services.one_denta import OneDentaService

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


class CreateAppointmentBody(BaseModel):
    patient_name: str
    patient_phone: str
    patient_email: str | None = None
    doctor_id: str
    doctor_name: str
    service: str
    service_ids: list[str] = []
    scheduled_at: str
    duration_min: int = 30
    comment: str = ""
    branch: str = ""


@router.post("/", status_code=201)
async def create_appointment(
    body: CreateAppointmentBody,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Create a new appointment locally and optionally in 1Denta."""
    patient_stmt = select(Patient).where(Patient.phone == body.patient_phone)
    patient = (await db.execute(patient_stmt)).scalar_one_or_none()

    if not patient:
        patient = Patient(
            name=body.patient_name,
            phone=body.patient_phone,
            email=body.patient_email,
            source_channel="manual",
            is_new_patient=True,
        )
        db.add(patient)
        await db.flush()

    external_id = None
    try:
        svc = OneDentaService()
        result = await svc.create_visit(
            name=body.patient_name,
            phone=body.patient_phone,
            email=body.patient_email,
            service_ids=body.service_ids or ["1"],
            resource_id=body.doctor_id,
            dt=body.scheduled_at,
            comment=body.comment,
        )
        external_id = str(result.get("id", ""))
    except Exception:
        pass

    appt = Appointment(
        external_id=external_id or f"local-{uuid.uuid4().hex[:8]}",
        patient_id=patient.id,
        doctor_name=body.doctor_name,
        doctor_id=body.doctor_id,
        service=body.service,
        branch=body.branch,
        scheduled_at=datetime.fromisoformat(body.scheduled_at),
        duration_min=body.duration_min,
        status="unconfirmed",
    )
    db.add(appt)
    await db.flush()

    return {
        "id": str(appt.id),
        "external_id": appt.external_id,
        "patient_name": body.patient_name,
        "doctor_name": body.doctor_name,
        "scheduled_at": body.scheduled_at,
        "status": "unconfirmed",
    }


@router.get("/services")
async def list_services(
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return available services from 1Denta."""
    svc = OneDentaService()
    services = await svc.get_services()
    return {"services": services}


@router.get("/slots")
async def available_slots(
    resource_id: str = Query(..., description="Doctor resource ID"),
    service_ids: str = Query("1", description="Comma-separated service IDs"),
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return available time slots for a doctor on a given date."""
    svc = OneDentaService()
    ids = [s.strip() for s in service_ids.split(",")]
    slots = await svc.get_available_slots(resource_id=resource_id, service_ids=ids, date=date)
    return {"slots": slots}
