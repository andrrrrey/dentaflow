"""Celery task: send 24-hour appointment reminders via Max and Telegram bots."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.bot_reminders.send_appointment_reminders")
def send_appointment_reminders() -> None:
    import asyncio
    asyncio.run(_async_send_reminders())


async def _async_send_reminders() -> None:
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.bot_reminder import BotReminder

    now = datetime.now(timezone.utc)
    window_start = now + timedelta(hours=23)
    window_end = now + timedelta(hours=25)

    async with AsyncSessionLocal() as db:
        stmt = (
            select(BotReminder)
            .where(
                BotReminder.remind_sent == False,  # noqa: E712
                BotReminder.cancelled == False,    # noqa: E712
                BotReminder.scheduled_at >= window_start,
                BotReminder.scheduled_at <= window_end,
            )
        )
        reminders = (await db.execute(stmt)).scalars().all()
        logger.info("bot_reminders: found %d reminders to send", len(reminders))

        for reminder in reminders:
            try:
                await _send_reminder(db, reminder)
                reminder.remind_sent = True
            except Exception:
                logger.exception("bot_reminders: failed to send reminder %s", reminder.id)

        await db.commit()


async def _send_reminder(db, reminder) -> None:
    from app.services.integrations_service import get_raw_value
    from app.config import settings

    dt_local = reminder.scheduled_at.astimezone(
        __import__("zoneinfo").ZoneInfo("Europe/Moscow")
    )
    date_str = dt_local.strftime("%d.%m.%Y")
    time_str = dt_local.strftime("%H:%M")
    rid = str(reminder.id)

    text = (
        f"Напоминание о записи!\n\n"
        f"Завтра у вас визит в клинику:\n"
        f"🦷 {reminder.service_name or 'Приём'}\n"
        f"📅 {date_str} в {time_str}\n"
        f"👨‍⚕️ {reminder.doctor_name or ''}\n\n"
        "Ждём вас!"
    )

    if reminder.channel == "max":
        await _send_max_reminder(db, reminder, text, rid, settings)
    elif reminder.channel == "telegram":
        await _send_tg_reminder(db, reminder, text, rid, settings)


async def _send_max_reminder(db, reminder, text: str, rid: str, settings) -> None:
    from app.services.integrations_service import get_raw_value
    from app.services.max_vk import MaxVkService

    token = await get_raw_value(db, "max_bot_token") or settings.MAX_API_KEY
    if not token:
        logger.warning("bot_reminders: no Max token for reminder %s", rid)
        return

    buttons = [
        [{"type": "callback", "text": "🔄 Перенести", "payload": f"reschedule:{rid}"}],
        [{"type": "callback", "text": "❌ Отказаться от записи", "payload": f"cancel_appt:{rid}"}],
    ]
    svc = MaxVkService(bot_token=token)
    await svc.send_reply(int(reminder.chat_id), text, buttons=buttons)
    logger.info("bot_reminders: sent Max reminder to chat_id=%s", reminder.chat_id)


async def _send_tg_reminder(db, reminder, text: str, rid: str, settings) -> None:
    from app.services.integrations_service import get_raw_value
    from app.services.telegram_bot import TelegramBotService

    token = await get_raw_value(db, "telegram_bot_token") or settings.TELEGRAM_BOT_TOKEN
    if not token:
        logger.warning("bot_reminders: no Telegram token for reminder %s", rid)
        return

    reply_markup = {
        "inline_keyboard": [
            [{"text": "🔄 Перенести", "callback_data": f"reschedule:{rid}"}],
            [{"text": "❌ Отказаться от записи", "callback_data": f"cancel_appt:{rid}"}],
        ]
    }
    svc = TelegramBotService(bot_token=token)
    await svc.send_reply(int(reminder.chat_id), text, reply_markup=reply_markup)
    logger.info("bot_reminders: sent TG reminder to chat_id=%s", reminder.chat_id)
