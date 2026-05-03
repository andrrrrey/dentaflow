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
            "scheduled_at": appt.scheduled_at.strftime("%Y-%m-%dT%H:%M:%S") if appt.scheduled_at else None,
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


@router.get("/{appointment_id}")
async def get_appointment_detail(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return full appointment detail with patient info."""
    stmt = (
        select(Appointment, Patient)
        .outerjoin(Patient, Appointment.patient_id == Patient.id)
        .where(Appointment.id == appointment_id)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Appointment not found")

    appt, patient = row.Appointment, row.Patient
    response: dict = {
        "appointment": {
            "id": str(appt.id),
            "external_id": appt.external_id,
            "doctor_name": appt.doctor_name,
            "doctor_id": appt.doctor_id,
            "service": appt.service,
            "branch": appt.branch,
            "scheduled_at": appt.scheduled_at.strftime("%Y-%m-%dT%H:%M:%S") if appt.scheduled_at else None,
            "duration_min": appt.duration_min,
            "status": appt.status,
            "revenue": float(appt.revenue) if appt.revenue else 0,
        },
        "patient": None,
    }
    if patient:
        response["patient"] = {
            "id": str(patient.id),
            "external_id": patient.external_id,
            "name": patient.name,
            "phone": patient.phone,
            "email": patient.email,
            "birth_date": str(patient.birth_date) if patient.birth_date else None,
            "source_channel": patient.source_channel,
            "is_new_patient": patient.is_new_patient,
            "last_visit_at": patient.last_visit_at.strftime("%Y-%m-%dT%H:%M:%S") if patient.last_visit_at else None,
            "total_revenue": float(patient.total_revenue),
            "ltv_score": patient.ltv_score,
            "tags": patient.tags,
            "raw_1denta_data": patient.raw_1denta_data,
        }
    return response


class UpdateAppointmentBody(BaseModel):
    service: str | None = None
    doctor_name: str | None = None
    doctor_id: str | None = None


@router.patch("/{appointment_id}")
async def update_appointment(
    appointment_id: uuid.UUID,
    body: UpdateAppointmentBody,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Update appointment service or doctor."""
    stmt = select(Appointment).where(Appointment.id == appointment_id)
    result = await db.execute(stmt)
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    if body.service is not None:
        appt.service = body.service
    if body.doctor_name is not None:
        appt.doctor_name = body.doctor_name
    if body.doctor_id is not None:
        appt.doctor_id = body.doctor_id

    await db.commit()
    return {
        "id": str(appt.id),
        "service": appt.service,
        "doctor_name": appt.doctor_name,
        "doctor_id": appt.doctor_id,
    }


class UpdateAppointmentStatusBody(BaseModel):
    status: str


@router.patch("/{appointment_id}/status")
async def update_appointment_status(
    appointment_id: uuid.UUID,
    body: UpdateAppointmentStatusBody,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Update the status of an appointment."""
    valid_statuses = {"confirmed", "unconfirmed", "arrived", "completed", "cancelled", "no_show"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

    stmt = select(Appointment).where(Appointment.id == appointment_id)
    result = await db.execute(stmt)
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    appt.status = body.status
    await db.commit()
    await db.refresh(appt)

    # Push attendance change to 1Denta if the appointment originated there
    if appt.external_id and not appt.external_id.startswith("local-"):
        try:
            svc = await OneDentaService.from_db(db)
            attendance = svc._ATTENDANCE_MAP.get(body.status)
            if attendance is not None:
                await svc.update_visit(appt.external_id, attendance=attendance)
        except Exception:
            pass  # 1Denta sync is best-effort; don't fail the local update

    return {"id": str(appt.id), "status": appt.status}


@router.post("/sync")
async def trigger_sync(
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Dispatch 1Denta sync tasks to Celery (non-blocking)."""
    from app.tasks.sync_1denta import sync_patients, sync_appointments

    sync_patients.delay()
    sync_appointments.delay()
    return {"status": "started"}


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
        svc = await OneDentaService.from_db(db)
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
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return available services from 1Denta."""
    svc = await OneDentaService.from_db(db)
    services = await svc.get_services()
    return {"services": services}


@router.get("/slots")
async def available_slots(
    resource_id: str = Query(..., description="Doctor resource ID"),
    service_ids: str = Query("1", description="Comma-separated service IDs"),
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return available time slots for a doctor on a given date."""
    svc = await OneDentaService.from_db(db)
    ids = [s.strip() for s in service_ids.split(",")]
    slots = await svc.get_available_slots(resource_id=resource_id, service_ids=ids, date=date)
    return {"slots": slots}
