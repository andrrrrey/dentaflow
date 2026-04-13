import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

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
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _current_user: User = Depends(get_current_user),
) -> PatientListResponse:
    """Return paginated patient list with optional search."""
    return await get_patients(search=search, page=page, limit=limit)


@router.get("/{patient_id}", response_model=PatientDetailResponse)
async def read_patient(
    patient_id: uuid.UUID,
    _current_user: User = Depends(get_current_user),
) -> PatientDetailResponse:
    """Return full 360 patient card."""
    detail = await get_patient_detail(patient_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    return detail


@router.post("/", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_new_patient(
    body: PatientCreate,
    _current_user: User = Depends(get_current_user),
) -> PatientResponse:
    """Create a new patient."""
    return await create_patient(
        name=body.name,
        phone=body.phone,
        email=body.email,
        birth_date=str(body.birth_date) if body.birth_date else None,
        source_channel=body.source_channel,
        tags=body.tags,
    )


@router.patch("/{patient_id}", response_model=PatientResponse)
async def patch_patient(
    patient_id: uuid.UUID,
    body: PatientUpdate,
    _current_user: User = Depends(get_current_user),
) -> PatientResponse:
    """Update patient fields."""
    updated = await update_patient(
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
