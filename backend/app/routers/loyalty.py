import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, role_required
from app.models.patient import Patient
from app.models.user import User
from app.schemas.loyalty import (
    AwardPointsRequest,
    LoyaltyConfig,
    LoyaltyLedgerResponse,
    LoyaltyStats,
    LoyaltyTransactionEntry,
    PatientBrief,
    ReferralCodeResponse,
    ReviewDecisionRequest,
    ReviewEntry,
)
from app.services import loyalty_service

router = APIRouter(prefix="/api/v1/loyalty", tags=["loyalty"])


# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------

@router.get("/config", response_model=LoyaltyConfig)
async def get_loyalty_config(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> LoyaltyConfig:
    return await loyalty_service.get_config(db=db)


@router.put("/config", response_model=LoyaltyConfig)
async def update_loyalty_config(
    body: LoyaltyConfig,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(role_required("owner", "manager")),
) -> LoyaltyConfig:
    return await loyalty_service.save_config(db=db, config=body)


# ------------------------------------------------------------------
# Stats
# ------------------------------------------------------------------

@router.get("/stats", response_model=LoyaltyStats)
async def loyalty_stats(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> LoyaltyStats:
    return await loyalty_service.get_stats(db=db)


# ------------------------------------------------------------------
# Per-patient
# ------------------------------------------------------------------

@router.get("/patients/{patient_id}/ledger", response_model=LoyaltyLedgerResponse)
async def patient_ledger(
    patient_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> LoyaltyLedgerResponse:
    patient = await db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    items = await loyalty_service.get_patient_ledger(db=db, patient_id=patient_id)
    return LoyaltyLedgerResponse(
        balance=int(patient.bonus_balance or 0),
        items=[LoyaltyTransactionEntry.model_validate(i) for i in items],
    )


@router.post("/patients/{patient_id}/award", response_model=LoyaltyTransactionEntry)
async def award_patient_points(
    patient_id: uuid.UUID,
    body: AwardPointsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LoyaltyTransactionEntry:
    patient = await db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if body.points == 0:
        raise HTTPException(status_code=400, detail="Points must be non-zero")
    entry = await loyalty_service.award_points(
        db=db,
        patient_id=patient_id,
        action_type=body.action_type or "manual",
        points=body.points,
        description=body.description,
        created_by=current_user.id,
    )
    return LoyaltyTransactionEntry.model_validate(entry)


@router.post("/patients/{patient_id}/referral-code", response_model=ReferralCodeResponse)
async def create_referral_code(
    patient_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> ReferralCodeResponse:
    code = await loyalty_service.get_or_create_referral_code(db=db, patient_id=patient_id)
    if code is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return ReferralCodeResponse(patient_id=patient_id, referral_code=code)


@router.get("/patients/by-referral-code/{code}", response_model=PatientBrief)
async def patient_by_referral_code(
    code: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> PatientBrief:
    patient = await loyalty_service.find_patient_by_referral_code(db=db, code=code)
    if patient is None:
        raise HTTPException(status_code=404, detail="Пациент с таким кодом не найден")
    return PatientBrief.model_validate(patient)


# ------------------------------------------------------------------
# Reviews
# ------------------------------------------------------------------

@router.get("/reviews", response_model=list[ReviewEntry])
async def list_reviews(
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[ReviewEntry]:
    return await loyalty_service.list_reviews(db=db, status=status)


@router.post("/reviews/{review_id}/approve", response_model=ReviewEntry)
async def approve_review(
    review_id: uuid.UUID,
    body: ReviewDecisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReviewEntry:
    if body.points is None or body.points <= 0:
        raise HTTPException(status_code=400, detail="Points must be positive")
    review = await loyalty_service.approve_review(
        db=db, review_id=review_id, points=body.points, reviewed_by=current_user.id
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    entries = await loyalty_service.list_reviews(db=db)
    for e in entries:
        if e.id == review_id:
            return e
    raise HTTPException(status_code=404, detail="Review not found")


@router.post("/reviews/{review_id}/reject", response_model=ReviewEntry)
async def reject_review(
    review_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReviewEntry:
    review = await loyalty_service.reject_review(
        db=db, review_id=review_id, reviewed_by=current_user.id
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    entries = await loyalty_service.list_reviews(db=db)
    for e in entries:
        if e.id == review_id:
            return e
    raise HTTPException(status_code=404, detail="Review not found")
