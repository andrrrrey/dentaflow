import uuid
from datetime import date, datetime

from pydantic import BaseModel


class AppointmentResponse(BaseModel):
    id: uuid.UUID
    external_id: str | None
    patient_id: uuid.UUID | None
    doctor_name: str | None
    service: str | None
    branch: str | None
    scheduled_at: datetime | None
    duration_min: int
    status: str | None
    no_show_risk: int | None
    revenue: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CommunicationBrief(BaseModel):
    id: uuid.UUID
    channel: str
    direction: str
    type: str
    content: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DealBrief(BaseModel):
    id: uuid.UUID
    title: str
    stage: str
    amount: float | None
    service: str | None
    doctor_name: str | None
    stage_changed_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskBrief(BaseModel):
    id: uuid.UUID
    type: str | None
    title: str | None
    due_at: datetime | None
    is_done: bool
    done_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AIAnalysis(BaseModel):
    summary: str
    barriers: list[str]
    return_probability: int  # 0-100
    next_action: str


class PatientResponse(BaseModel):
    id: uuid.UUID
    external_id: str | None
    name: str
    phone: str | None
    email: str | None
    birth_date: date | None
    source_channel: str | None
    is_new_patient: bool
    last_visit_at: datetime | None
    total_revenue: float
    ltv_score: int | None
    tags: list[str] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PatientStats(BaseModel):
    total_visits: int
    completed_visits: int
    cancelled_visits: int
    no_show_visits: int
    total_revenue: float
    avg_revenue_per_visit: float
    first_visit_at: datetime | None
    last_visit_at: datetime | None
    unique_doctors: int
    unique_services: int


class PatientDetailResponse(PatientResponse):
    appointments: list[AppointmentResponse]
    communications: list[CommunicationBrief]
    deals: list[DealBrief]
    tasks: list[TaskBrief]
    ai_analysis: AIAnalysis
    stats: PatientStats
    raw_1denta_data: dict | None = None


class PatientListResponse(BaseModel):
    items: list[PatientResponse]
    total: int


class PatientCreate(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None
    birth_date: date | None = None
    source_channel: str | None = None
    tags: list[str] | None = None


class PatientUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    birth_date: date | None = None
    source_channel: str | None = None
    tags: list[str] | None = None
    ltv_score: int | None = None
