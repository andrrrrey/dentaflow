import uuid
from datetime import datetime

from pydantic import BaseModel


class DealResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID | None
    patient_name: str | None
    title: str
    stage: str
    amount: float | None
    service: str | None
    doctor_name: str | None
    assigned_to: uuid.UUID | None
    assigned_to_name: str | None
    source_channel: str | None
    notes: str | None
    lost_reason: str | None
    stage_changed_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class DealCreate(BaseModel):
    patient_id: uuid.UUID | None = None
    patient_name: str | None = None
    patient_phone: str | None = None
    title: str
    stage: str = "new"
    amount: float | None = None
    service: str | None = None
    doctor_name: str | None = None
    source_channel: str | None = None
    assigned_to: uuid.UUID | None = None
    notes: str | None = None


class DealUpdate(BaseModel):
    stage: str | None = None
    amount: float | None = None
    notes: str | None = None
    lost_reason: str | None = None
    title: str | None = None
    service: str | None = None
    doctor_name: str | None = None
    assigned_to: uuid.UUID | None = None
    source_channel: str | None = None


class DealNoteCreate(BaseModel):
    text: str


class DealNote(BaseModel):
    id: uuid.UUID
    deal_id: uuid.UUID
    text: str
    author_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class StageColumn(BaseModel):
    stage: str
    label: str
    deals: list[DealResponse]
    count: int
    total_amount: float


class PipelineResponse(BaseModel):
    stages: list[StageColumn]
    total_pipeline_value: float


class StageHistoryEntry(BaseModel):
    id: uuid.UUID
    deal_id: uuid.UUID
    from_stage: str | None
    to_stage: str | None
    changed_by: uuid.UUID | None
    comment: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
