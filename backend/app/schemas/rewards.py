import uuid
from datetime import datetime

from pydantic import BaseModel


class RewardsConfig(BaseModel):
    task_completed: int = 10
    call_made: int = 5
    script_compliance: int = 15
    appointment_confirmed: int = 20
    patient_reached: int = 8


class PointsEntry(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None
    action_type: str
    points: int
    task_id: uuid.UUID | None
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LeaderboardEntry(BaseModel):
    user_id: uuid.UUID
    name: str
    avatar_url: str | None
    total_points: int
    tasks_completed: int
    rank: int


class LeaderboardResponse(BaseModel):
    items: list[LeaderboardEntry]


class AwardPointsRequest(BaseModel):
    user_id: uuid.UUID
    action_type: str
    points: int
    description: str | None = None
