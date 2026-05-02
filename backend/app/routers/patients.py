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
