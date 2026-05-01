import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class DiscountBase(BaseModel):
    name: str
    type: str  # percent | fixed | bonus
    value: float
    code: str | None = None
    applies_to: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    min_purchase: float | None = None
    max_uses: int | None = None
    is_active: bool = True
    description: str | None = None


class DiscountCreate(DiscountBase):
    pass


class DiscountUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    value: float | None = None
    code: str | None = None
    applies_to: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    min_purchase: float | None = None
    max_uses: int | None = None
    is_active: bool | None = None
    description: str | None = None


class DiscountResponse(DiscountBase):
    id: uuid.UUID
    used_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DiscountListResponse(BaseModel):
    items: list[DiscountResponse]
    total: int


class CertificateBase(BaseModel):
    recipient_name: str | None = None
    recipient_phone: str | None = None
    recipient_email: str | None = None
    purchased_by: str | None = None
    valid_from: date
    valid_to: date
    note: str | None = None


class CertificateCreate(CertificateBase):
    amount: float
    code: str | None = None  # auto-generated if None


class CertificateUpdate(BaseModel):
    recipient_name: str | None = None
    recipient_phone: str | None = None
    recipient_email: str | None = None
    purchased_by: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    status: str | None = None
    note: str | None = None
    remaining_amount: float | None = None


class CertificateResponse(CertificateBase):
    id: uuid.UUID
    code: str
    amount: float
    remaining_amount: float
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CertificateListResponse(BaseModel):
    items: list[CertificateResponse]
    total: int
