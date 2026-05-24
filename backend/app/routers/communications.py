import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.bot_message import BotMessage
from app.models.user import User
from app.schemas.communication import (
    BotMessageResponse,
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


@router.get("/{communication_id}/messages", response_model=list[BotMessageResponse])
async def list_communication_messages(
    communication_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[BotMessage]:
    """Return all bot messages for a communication, ordered by time."""
    stmt = (
        select(BotMessage)
        .where(BotMessage.communication_id == communication_id)
        .order_by(BotMessage.created_at)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/{communication_id}/reply", response_model=BotMessageResponse)
async def reply_to_communication(
    communication_id: uuid.UUID,
    body: ReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BotMessage:
    """Send a reply to a bot communication and store it as an outbound message."""
    from app.models.communication import Communication
    from app.services.integrations_service import get_raw_value
    from app.config import settings

    comm_stmt = select(Communication).where(Communication.id == communication_id)
    comm_row = (await db.execute(comm_stmt)).scalar_one_or_none()
    if comm_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Communication not found")

    if not comm_row.bot_chat_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No bot chat_id stored for this communication — cannot send reply",
        )

    # Send via the appropriate bot channel
    if comm_row.channel == "telegram":
        from app.services.telegram_bot import TelegramBotService
        tg_token = await get_raw_value(db, "telegram_bot_token") or settings.TELEGRAM_BOT_TOKEN
        if tg_token:
            tg_svc = TelegramBotService(bot_token=tg_token)
            await tg_svc.send_reply(int(comm_row.bot_chat_id), body.text)
    elif comm_row.channel == "max":
        from app.services.max_vk import MaxVkService
        max_token = await get_raw_value(db, "max_bot_token") or settings.MAX_API_KEY
        if max_token:
            max_svc = MaxVkService(bot_token=max_token)
            await max_svc.send_reply(comm_row.bot_chat_id, body.text, buttons=[])

    sender = current_user.name or current_user.email
    msg = BotMessage(
        communication_id=communication_id,
        direction="outbound",
        content=body.text,
        sender_name=sender or None,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg
