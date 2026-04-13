"""Mock data service for notifications."""

import uuid
from datetime import datetime, timedelta, timezone

from app.schemas.notification import NotificationListResponse, NotificationResponse

_now = datetime.now(timezone.utc)


def _dt(days_ago: int, hours: int = 0) -> datetime:
    return _now - timedelta(days=days_ago, hours=hours)


_notif_uuids = [uuid.UUID(f"n0000000-0000-4000-a000-{i:012d}") for i in range(10)]
_user_id = uuid.UUID("a0000000-0000-4000-a000-000000000001")

MOCK_NOTIFICATIONS: list[NotificationResponse] = [
    NotificationResponse(
        id=_notif_uuids[0],
        user_id=_user_id,
        type="missed_call",
        title="Пропущенный звонок",
        body="Пациент Иванов Сергей звонил 10 минут назад, не дозвонился",
        link="/communications",
        is_read=False,
        created_at=_dt(0, 0),
    ),
    NotificationResponse(
        id=_notif_uuids[1],
        user_id=_user_id,
        type="stale_lead",
        title="Лид без движения 3 дня",
        body="Сделка «Имплантация зубов» — Петрова М. не обрабатывалась 3 дня",
        link="/deals",
        is_read=False,
        created_at=_dt(0, 2),
    ),
    NotificationResponse(
        id=_notif_uuids[2],
        user_id=_user_id,
        type="ai_alert",
        title="AI: негативный тон в чате",
        body="В переписке с Кузнецовым А. обнаружен негативный настрой, рекомендуется перезвонить",
        link="/communications",
        is_read=False,
        created_at=_dt(0, 5),
    ),
    NotificationResponse(
        id=_notif_uuids[3],
        user_id=_user_id,
        type="deal_stuck",
        title="Сделка застряла",
        body="Сделка «Ортодонтия — брекеты» на этапе «Контакт» уже 5 дней",
        link="/deals",
        is_read=False,
        created_at=_dt(1, 0),
    ),
    NotificationResponse(
        id=_notif_uuids[4],
        user_id=_user_id,
        type="missed_call",
        title="Пропущенный звонок",
        body="Пациент Сидорова Е. звонила вчера в 15:30",
        link="/communications",
        is_read=True,
        created_at=_dt(1, 8),
    ),
    NotificationResponse(
        id=_notif_uuids[5],
        user_id=_user_id,
        type="stale_lead",
        title="Лид без движения 5 дней",
        body="Сделка «Протезирование» — Васильева О. ожидает ответа",
        link="/deals",
        is_read=True,
        created_at=_dt(2, 0),
    ),
    NotificationResponse(
        id=_notif_uuids[6],
        user_id=_user_id,
        type="ai_alert",
        title="AI: рекомендация по допродаже",
        body="Пациенту Козлову А. можно предложить отбеливание после установки виниров",
        link="/patients",
        is_read=True,
        created_at=_dt(3, 0),
    ),
    NotificationResponse(
        id=_notif_uuids[7],
        user_id=_user_id,
        type="deal_stuck",
        title="Сделка застряла",
        body="Сделка «Отбеливание» — Морозов Д. на этапе «Контакт» 4 дня без активности",
        link="/deals",
        is_read=True,
        created_at=_dt(4, 0),
    ),
]


async def list_notifications(
    is_read: bool | None = None,
) -> NotificationListResponse:
    """Return filtered notification list."""
    items = list(MOCK_NOTIFICATIONS)

    if is_read is not None:
        items = [n for n in items if n.is_read == is_read]

    unread = sum(1 for n in MOCK_NOTIFICATIONS if not n.is_read)

    return NotificationListResponse(
        items=items,
        total=len(items),
        unread_count=unread,
    )


async def mark_as_read(notification_id: uuid.UUID) -> NotificationResponse | None:
    for i, notif in enumerate(MOCK_NOTIFICATIONS):
        if notif.id == notification_id:
            data = notif.model_dump()
            data["is_read"] = True
            updated = NotificationResponse(**data)
            MOCK_NOTIFICATIONS[i] = updated
            return updated
    return None


async def mark_all_read() -> int:
    count = 0
    for i, notif in enumerate(MOCK_NOTIFICATIONS):
        if not notif.is_read:
            data = notif.model_dump()
            data["is_read"] = True
            MOCK_NOTIFICATIONS[i] = NotificationResponse(**data)
            count += 1
    return count
