import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.communication import (
    CommunicationListResponse,
    CommunicationResponse,
    CommunicationUpdate,
    ReplyRequest,
)
from app.services.communications_service import (
    delete_communication,
    get_communication_by_id,
    get_communication_stats,
    get_communications,
    update_communication,
)

router = APIRouter(prefix="/api/v1/communications", tags=["communications"])


@router.get("/stats")
async def communications_stats(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    """Return communication counts by status."""
    return await get_communication_stats(db)


@router.get("/", response_model=CommunicationListResponse)
async def list_communications(
    status_filter: str | None = Query(None, alias="status"),
    channel: str | None = Query(None),
    priority: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> CommunicationListResponse:
    """Return paginated communications list with optional filters."""
    return await get_communications(
        status=status_filter,
        channel=channel,
        priority=priority,
        page=page,
        limit=limit,
        db=db,
    )


@router.get("/{communication_id}", response_model=CommunicationResponse)
async def get_single_communication(
    communication_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> CommunicationResponse:
    """Return a single communication by ID."""
    item = await get_communication_by_id(communication_id, db)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Communication not found",
        )
    return item


@router.patch("/{communication_id}", response_model=CommunicationResponse)
async def patch_communication(
    communication_id: uuid.UUID,
    body: CommunicationUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> CommunicationResponse:
    """Update status, assigned_to, or priority of a communication."""
    item = await update_communication(communication_id, body, db)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Communication not found",
        )
    return item


@router.delete("/{communication_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_communication_endpoint(
    communication_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> None:
    """Delete a communication by ID."""
    await delete_communication(communication_id, db)


@router.post("/{communication_id}/reply")
async def reply_to_communication(
    communication_id: uuid.UUID,
    body: ReplyRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Send a reply to a communication (mock in dev mode)."""
    item = await get_communication_by_id(communication_id, db)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Communication not found",
        )
    # In dev mode, just acknowledge
    return {"status": "sent", "channel": body.channel, "message": body.text}
