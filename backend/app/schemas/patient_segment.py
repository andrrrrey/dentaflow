import uuid
from datetime import datetime

from pydantic import BaseModel


class SegmentResponse(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    description: str | None
    kind: str
    status: str
    progress: int
    processed: int
    total: int
    member_count: int
    computed_at: datetime | None
    error: str | None

    model_config = {"from_attributes": True}


class SegmentListResponse(BaseModel):
    items: list[SegmentResponse]


class SegmentMemberResponse(BaseModel):
    patient_id: uuid.UUID
    name: str
    phone: str | None
    email: str | None
    last_visit_at: datetime | None
    total_revenue: float
    reason: str | None
    added_at: datetime


class SegmentMemberListResponse(BaseModel):
    items: list[SegmentMemberResponse]
    total: int


class AddMembersRequest(BaseModel):
    patient_ids: list[uuid.UUID]
