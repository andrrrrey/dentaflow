import uuid
from datetime import datetime

from pydantic import BaseModel


class CommunicationResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID | None
    patient_name: str | None
    channel: str
    direction: str
    type: str
    content: str | None
    media_url: str | None
    duration_sec: int | None
    status: str
    priority: str
    ai_tags: list[str] | None
    ai_summary: str | None
    ai_next_action: str | None
    assigned_to: uuid.UUID | None
    assigned_to_name: str | None
    responded_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CommunicationListResponse(BaseModel):
    items: list[CommunicationResponse]
    total: int
    unread_count: int


class CommunicationUpdate(BaseModel):
    status: str | None = None
    assigned_to: uuid.UUID | None = None
    priority: str | None = None


class ReplyRequest(BaseModel):
    channel: str
    text: str
