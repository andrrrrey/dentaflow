import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.patient import (
    PatientCreate,
    PatientDetailResponse,
    PatientListResponse,
    PatientResponse,
    PatientUpdate,
)
from app.services.patients_service import (
    create_patient,
    get_patient_detail,
    get_patients,
    update_patient,
)

router = APIRouter(prefix="/api/v1/patients", tags=["patients"])


@router.get("/", response_model=PatientListResponse)
async def list_patients(
    search: str | None = Query(None, description="Search by name, phone, email"),
    visited: str | None = Query(None, description="visited | not_visited"),
    gender: str | None = Query(None, description="male | female"),
    patient_type: str | None = Query(None, description="new|regular|refused|potential|noGroup"),
    source_channel: str | None = Query(None),
    birth_date_from: str | None = Query(None, description="YYYY-MM-DD"),
    birth_date_to: str | None = Query(None, description="YYYY-MM-DD"),
    last_visit_from: str | None = Query(None, description="YYYY-MM-DD"),
    last_visit_to: str | None = Query(None, description="YYYY-MM-DD"),
    created_from: str | None = Query(None, description="YYYY-MM-DD"),
    created_to: str | None = Query(None, description="YYYY-MM-DD"),
    revenue_min: float | None = Query(None),
    revenue_max: float | None = Query(None),
    visits_min: int | None = Query(None),
    visits_max: int | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> PatientListResponse:
    return await get_patients(
        db=db,
        search=search,
        visited=visited,
        gender=gender,
        patient_type=patient_type,
        source_channel=source_channel,
        birth_date_from=birth_date_from,
        birth_date_to=birth_date_to,
        last_visit_from=last_visit_from,
        last_visit_to=last_visit_to,
        created_from=created_from,
        created_to=created_to,
        revenue_min=revenue_min,
        revenue_max=revenue_max,
        visits_min=visits_min,
        visits_max=visits_max,
        page=page,
        limit=limit,
    )


@router.get("/{patient_id}", response_model=PatientDetailResponse)
async def read_patient(
    patient_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> PatientDetailResponse:
    detail = await get_patient_detail(patient_id, db=db)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    return detail


@router.post("/", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_new_patient(
    body: PatientCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> PatientResponse:
    return await create_patient(
        db=db,
        name=body.name,
        phone=body.phone,
        email=body.email,
        birth_date=str(body.birth_date) if body.birth_date else None,
        source_channel=body.source_channel,
        tags=body.tags,
    )


@router.post("/{patient_id}/sync-1denta")
async def sync_patient_from_1denta(
    patient_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Fetch all historical visits for this patient from 1Denta and store them locally."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.services.one_denta import OneDentaService

    patient = await db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    if not patient.external_id:
        return {"ok": False, "message": "Пациент не связан с 1Denta (нет external_id)"}

    try:
        service = await OneDentaService.from_db(db)
        now = datetime.now(timezone.utc)
        appointments_data = await service.get_appointments(
            date_from=now - timedelta(days=5 * 365),
            date_to=now + timedelta(days=365),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Не удалось подключиться к 1Denta: {exc}")

    patient_visits = [
        a for a in appointments_data
        if a.get("patient_external_id") == patient.external_id
    ]

    created = 0
    updated = 0
    for a_data in patient_visits:
        ext_id = a_data.get("external_id")
        if not ext_id:
            continue

        stmt = select(Appointment).where(Appointment.external_id == ext_id).limit(1)
        result = await db.execute(stmt)
        appointment = result.scalar_one_or_none()

        scheduled_at = None
        if a_data.get("scheduled_at"):
            try:
                scheduled_at = datetime.fromisoformat(a_data["scheduled_at"])
            except ValueError:
                pass

        if appointment is None:
            appointment = Appointment(
                external_id=ext_id,
                patient_id=patient_id,
                doctor_name=a_data.get("doctor_name"),
                doctor_id=a_data.get("doctor_id"),
                service=a_data.get("service"),
                branch=a_data.get("branch"),
                scheduled_at=scheduled_at,
                duration_min=a_data.get("duration_min", 30),
                status=a_data.get("status"),
                revenue=a_data.get("revenue"),
                comment=a_data.get("comment"),
                synced_at=now,
            )
            db.add(appointment)
            created += 1
        else:
            appointment.patient_id = patient_id
            appointment.doctor_name = a_data.get("doctor_name", appointment.doctor_name)
            appointment.service = a_data.get("service", appointment.service)
            appointment.scheduled_at = scheduled_at or appointment.scheduled_at
            appointment.status = a_data.get("status", appointment.status)
            appointment.revenue = a_data.get("revenue", appointment.revenue)
            appointment.synced_at = now
            updated += 1

    # Update patient last_visit_at and total_revenue
    if patient_visits:
        dates = [a.get("scheduled_at") for a in patient_visits if a.get("scheduled_at")]
        if dates:
            patient.last_visit_at = datetime.fromisoformat(max(dates))
        revenues = [a.get("revenue", 0) or 0 for a in patient_visits]
        patient.total_revenue = sum(revenues)

    await db.commit()
    return {"ok": True, "synced": len(patient_visits), "created": created, "updated": updated}


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> None:
    from app.models.patient import Patient
    patient = await db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await db.delete(patient)
    await db.commit()


@router.patch("/{patient_id}", response_model=PatientResponse)
async def patch_patient(
    patient_id: uuid.UUID,
    body: PatientUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> PatientResponse:
    updated = await update_patient(
        db=db,
        patient_id=patient_id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        birth_date=str(body.birth_date) if body.birth_date else None,
        source_channel=body.source_channel,
        tags=body.tags,
        ltv_score=body.ltv_score,
    )
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    return updated
