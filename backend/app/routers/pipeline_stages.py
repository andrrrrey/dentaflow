"""Pipeline stages CRUD — rename and reorder funnel stages."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.pipeline_stage import PipelineStage
from app.models.user import User

router = APIRouter(prefix="/api/v1/pipeline-stages", tags=["pipeline-stages"])

DEFAULT_STAGES = [
    {"key": "waiting_list", "label": "Лист ожидания", "color": "#8a8fa5", "position": 0},
    {"key": "new", "label": "Новые", "color": "#3B7FED", "position": 1},
    {"key": "contact", "label": "Контакт", "color": "#5B4CF5", "position": 2},
    {"key": "negotiation", "label": "Переговоры", "color": "#F5A623", "position": 3},
    {"key": "scheduled", "label": "Записан", "color": "#00C9A7", "position": 4},
    {"key": "treatment", "label": "Лечение", "color": "#6c5ce7", "position": 5},
    {"key": "closed_won", "label": "Закрыто ✓", "color": "#00C9A7", "position": 6, "is_system": True},
    {"key": "closed_lost", "label": "Закрыто ✗", "color": "#f44b6e", "position": 7, "is_system": True},
]


async def _ensure_defaults(db: AsyncSession) -> None:
    result = await db.execute(select(PipelineStage).limit(1))
    if result.scalar_one_or_none() is not None:
        return
    for s in DEFAULT_STAGES:
        db.add(PipelineStage(**s))
    await db.commit()


class StageResponse(BaseModel):
    id: str
    key: str
    label: str
    color: str
    position: int
    is_system: bool


class StageRenameRequest(BaseModel):
    label: str


class StageReorderRequest(BaseModel):
    stage_ids: list[str]


@router.get("/", response_model=list[StageResponse])
async def list_stages(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[StageResponse]:
    await _ensure_defaults(db)
    result = await db.execute(
        select(PipelineStage).order_by(PipelineStage.position)
    )
    stages = result.scalars().all()
    return [
        StageResponse(
            id=str(s.id), key=s.key, label=s.label,
            color=s.color, position=s.position, is_system=s.is_system,
        )
        for s in stages
    ]


@router.patch("/{stage_id}", response_model=StageResponse)
async def rename_stage(
    stage_id: uuid.UUID,
    body: StageRenameRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> StageResponse:
    stage = await db.get(PipelineStage, stage_id)
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    stage.label = body.label
    await db.commit()
    return StageResponse(
        id=str(stage.id), key=stage.key, label=stage.label,
        color=stage.color, position=stage.position, is_system=stage.is_system,
    )


@router.put("/reorder")
async def reorder_stages(
    body: StageReorderRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[StageResponse]:
    result = await db.execute(select(PipelineStage))
    stages_map = {str(s.id): s for s in result.scalars().all()}
    for idx, sid in enumerate(body.stage_ids):
        if sid in stages_map:
            stages_map[sid].position = idx
    await db.commit()
    ordered = sorted(stages_map.values(), key=lambda s: s.position)
    return [
        StageResponse(
            id=str(s.id), key=s.key, label=s.label,
            color=s.color, position=s.position, is_system=s.is_system,
        )
        for s in ordered
    ]
