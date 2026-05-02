import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
from app.schemas.deal import (
    DealCreate,
    DealNote,
    DealNoteCreate,
    DealResponse,
    DealUpdate,
    PipelineResponse,
    StageHistoryEntry,
)
from app.services.deals_service import (
    add_deal_note,
    create_deal,
    delete_deal,
    get_deal,
    get_deal_history,
    get_deal_notes,
    get_pipeline,
    update_deal,
)

router = APIRouter(prefix="/api/v1/deals", tags=["deals"])


@router.get("/", response_model=PipelineResponse)
async def list_pipeline(
    stage: str | None = Query(None, description="Filter by stage"),
    assigned_to: str | None = Query(None, description="Filter by assigned user"),
    _current_user: User = Depends(get_current_user),
) -> PipelineResponse:
    return await get_pipeline(stage=stage, assigned_to=assigned_to)


@router.post("/", response_model=DealResponse, status_code=status.HTTP_201_CREATED)
async def create_new_deal(
    body: DealCreate,
    current_user: User = Depends(get_current_user),
) -> DealResponse:
    try:
        return await create_deal(
            title=body.title,
            stage=body.stage,
            patient_id=body.patient_id,
            amount=body.amount,
            service=body.service,
            assigned_to=body.assigned_to,
            notes=body.notes,
            doctor_name=body.doctor_name,
            source_channel=body.source_channel,
            patient_name=body.patient_name,
            patient_phone=body.patient_phone,
        )
    except Exception:
        logger.exception("Error creating deal: %s", body.model_dump())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось создать сделку. Проверьте логи сервера.",
        )


@router.get("/{deal_id}", response_model=DealResponse)
async def read_deal(
    deal_id: uuid.UUID,
    _current_user: User = Depends(get_current_user),
) -> DealResponse:
    deal = await get_deal(deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.patch("/{deal_id}", response_model=DealResponse)
async def patch_deal(
    deal_id: uuid.UUID,
    body: DealUpdate,
    _current_user: User = Depends(get_current_user),
) -> DealResponse:
    updated = await update_deal(
        deal_id=deal_id,
        stage=body.stage,
        amount=body.amount,
        notes=body.notes,
        lost_reason=body.lost_reason,
        title=body.title,
        service=body.service,
        doctor_name=body.doctor_name,
        assigned_to=body.assigned_to,
        source_channel=body.source_channel,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    return updated


@router.delete("/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_deal(
    deal_id: uuid.UUID,
    _current_user: User = Depends(get_current_user),
) -> None:
    deleted = await delete_deal(deal_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Deal not found")


@router.get("/{deal_id}/history", response_model=list[StageHistoryEntry])
async def deal_history(
    deal_id: uuid.UUID,
    _current_user: User = Depends(get_current_user),
) -> list[StageHistoryEntry]:
    return await get_deal_history(deal_id)


@router.get("/{deal_id}/notes", response_model=list[DealNote])
async def list_deal_notes(
    deal_id: uuid.UUID,
    _current_user: User = Depends(get_current_user),
) -> list[DealNote]:
    return await get_deal_notes(deal_id)


@router.post("/{deal_id}/notes", response_model=DealNote, status_code=status.HTTP_201_CREATED)
async def create_deal_note(
    deal_id: uuid.UUID,
    body: DealNoteCreate,
    current_user: User = Depends(get_current_user),
) -> DealNote:
    return await add_deal_note(deal_id=deal_id, text=body.text, author_id=current_user.id)
