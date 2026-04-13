import uuid
from datetime import datetime

from pydantic import BaseModel


class TaskResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID | None
    patient_name: str | None
    deal_id: uuid.UUID | None
    comm_id: uuid.UUID | None
    assigned_to: uuid.UUID | None
    assigned_to_name: str | None
    created_by: uuid.UUID | None
    type: str | None
    title: str | None
    due_at: datetime | None
    done_at: datetime | None
    is_done: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    patient_id: uuid.UUID | None = None
    type: str
    title: str
    due_at: datetime
    assigned_to: uuid.UUID | None = None


class TaskUpdate(BaseModel):
    is_done: bool | None = None
    done_at: datetime | None = None
    title: str | None = None
    due_at: datetime | None = None


class TaskListResponse(BaseModel):
    items: list[TaskResponse]
    total: int
    overdue_count: int
