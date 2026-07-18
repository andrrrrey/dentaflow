import uuid
from datetime import datetime

from pydantic import BaseModel


class LoyaltyConfig(BaseModel):
    enabled: bool = True
    # Начисление за покупку: баллов за каждые `purchase_rate_rubles` рублей оплаты.
    points_per_purchase_unit: int = 5
    purchase_rate_rubles: int = 100
    referral_points: int = 300
    review_points: int = 200


class LoyaltyTransactionEntry(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    action_type: str
    points: int
    description: str | None
    source_appointment_id: uuid.UUID | None
    review_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AwardPointsRequest(BaseModel):
    action_type: str = "manual"  # referral | review | manual
    points: int
    description: str | None = None


class ReferralCodeResponse(BaseModel):
    patient_id: uuid.UUID
    referral_code: str


class PatientBrief(BaseModel):
    id: uuid.UUID
    name: str
    phone: str | None
    bonus_balance: int
    referral_code: str | None

    model_config = {"from_attributes": True}


class ReviewEntry(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID | None
    patient_name: str | None = None
    channel: str | None
    image_url: str
    status: str
    points_awarded: int | None
    created_at: datetime
    reviewed_at: datetime | None

    model_config = {"from_attributes": True}


class ReviewDecisionRequest(BaseModel):
    points: int | None = None  # required for approve; ignored for reject


class LoyaltyLedgerResponse(BaseModel):
    balance: int
    items: list[LoyaltyTransactionEntry]


class RatingEntry(BaseModel):
    patient_id: uuid.UUID
    name: str
    value: int
    rank: int


class LoyaltyStats(BaseModel):
    total_points_awarded: int
    points_by_action: dict[str, int]
    pending_reviews: int
    approved_reviews: int
    total_referrals: int
    active_patients: int  # пациенты с ненулевым балансом
    top_by_balance: list[RatingEntry]
    top_by_referrals: list[RatingEntry]
