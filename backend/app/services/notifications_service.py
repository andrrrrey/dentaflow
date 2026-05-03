"""Notifications service — queries real DB for notifications.

Notifications are created by webhooks (new leads from connected sources)
and task creation events.
"""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.notification import Notification
from app.schemas.notification import NotificationListResponse, NotificationResponse


async def list_notifications(
    is_read: bool | None = None,
) -> NotificationListResponse:
    async with async_session_factory() as db:
        stmt = select(Notification).order_by(Notification.created_at.desc()).limit(50)

        if is_read is not None:
            stmt = stmt.where(Notification.is_read == is_read)

        result = await db.execute(stmt)
        rows = result.scalars().all()

        unread = (await db.execute(
            select(func.count(Notification.id)).where(Notification.is_read.is_(False))
        )).scalar() or 0

        items = [
            NotificationResponse.model_validate(row)
            for row in rows
        ]

        return NotificationListResponse(
            items=items,
            total=len(items),
            unread_count=unread,
        )


async def mark_as_read(notification_id: uuid.UUID) -> NotificationResponse | None:
    async with async_session_factory() as db:
        result = await db.execute(
            select(Notification).where(Notification.id == notification_id)
        )
        notif = result.scalar_one_or_none()
        if notif is None:
            return None

        notif.is_read = True
        await db.commit()
        await db.refresh(notif)
        return NotificationResponse.model_validate(notif)


async def mark_all_read() -> int:
    async with async_session_factory() as db:
        result = await db.execute(
            update(Notification)
            .where(Notification.is_read.is_(False))
            .values(is_read=True)
        )
        await db.commit()
        return result.rowcount
