import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationResponse
from app.services.notifications_service import (
    list_notifications,
    mark_all_read,
    mark_as_read,
)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("/", response_model=NotificationListResponse)
async def get_notifications(
    is_read: bool | None = Query(None, description="Filter by read status"),
    _current_user: User = Depends(get_current_user),
) -> NotificationListResponse:
    return await list_notifications(is_read=is_read)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def read_notification(
    notification_id: uuid.UUID,
    _current_user: User = Depends(get_current_user),
) -> NotificationResponse:
    updated = await mark_as_read(notification_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return updated


@router.post("/read-all")
async def read_all_notifications(
    _current_user: User = Depends(get_current_user),
) -> dict:
    count = await mark_all_read()
    return {"marked": count}
