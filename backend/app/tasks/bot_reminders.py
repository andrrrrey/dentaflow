"""Celery task: send 24-hour appointment reminders via Max and Telegram bots.

Reminders go to patients who:
1. Have launched the bot (record in bot_users table)
2. Have a phone number in DentaFlow that matches their bot account phone
3. Have an upcoming appointment in the next 23-25 hours
"""
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
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.bot_user import BotUser
    import redis.asyncio as aioredis
    from app.config import settings

    now = datetime.now(timezone.utc)
    window_start = now + timedelta(hours=23)
    window_end = now + timedelta(hours=25)

    rc = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

    try:
        async with AsyncSessionLocal() as db:
            # Find appointments in 23-25h window
            stmt = (
                select(Appointment, Patient)
                .join(Patient, Appointment.patient_id == Patient.id)
                .where(
                    Appointment.scheduled_at >= window_start,
                    Appointment.scheduled_at <= window_end,
                    Appointment.status.notin_(["cancelled", "no_show", "completed"]),
                )
            )
            rows = (await db.execute(stmt)).all()
            logger.info("bot_reminders: %d appointments in 23-25h window", len(rows))

            for appt, patient in rows:
                phone = patient.phone
                if not phone:
                    continue

                # Find bot users with this phone
                bot_stmt = select(BotUser).where(BotUser.phone == phone)
                bot_users = (await db.execute(bot_stmt)).scalars().all()

                for bot_user in bot_users:
                    remind_key = f"reminded:{appt.id}:{bot_user.channel}:{bot_user.chat_id}"
                    already_sent = await rc.get(remind_key)
                    if already_sent:
                        continue

                    try:
                        await _send_reminder_to_user(db, bot_user, appt, patient)
                        await rc.setex(remind_key, 172800, "1")  # 48h dedup TTL
                        logger.info(
                            "bot_reminders: sent reminder appt=%s to %s:%s",
                            appt.id, bot_user.channel, bot_user.chat_id,
                        )
                    except Exception:
                        logger.exception(
                            "bot_reminders: failed to send reminder appt=%s", appt.id
                        )
    finally:
        await rc.aclose()


async def _send_reminder_to_user(db, bot_user, appt, patient) -> None:
    import zoneinfo
    from app.config import settings
    from app.services.integrations_service import get_raw_value

    dt_local = appt.scheduled_at.astimezone(zoneinfo.ZoneInfo("Europe/Moscow"))
    date_str = dt_local.strftime("%d.%m.%Y")
    time_str = dt_local.strftime("%H:%M")
    appt_id = str(appt.id)

    name = patient.first_name or patient.last_name or "Пациент"
    text = (
        f"Напоминание о записи!\n\n"
        f"Здравствуйте, {name}!\n"
        f"Завтра у вас визит в клинику:\n"
        f"🦷 {appt.service or 'Приём'}\n"
        f"📅 {date_str} в {time_str}\n"
        f"👨‍⚕️ {appt.doctor_name or ''}\n\n"
        "Ждём вас!"
    )

    if bot_user.channel == "max":
        token = await get_raw_value(db, "max_bot_token") or settings.MAX_API_KEY
        if not token:
            logger.warning("bot_reminders: no Max token")
            return
        buttons = [
            [{"type": "callback", "text": "🔄 Перенести", "payload": f"reschedule_appt:{appt_id}"}],
            [{"type": "callback", "text": "❌ Отказаться", "payload": f"cancel_appt:{appt_id}"}],
        ]
        from app.services.max_vk import MaxVkService
        svc = MaxVkService(bot_token=token)
        await svc.send_reply(int(bot_user.chat_id), text, buttons=buttons)

    elif bot_user.channel == "telegram":
        token = await get_raw_value(db, "telegram_bot_token") or settings.TELEGRAM_BOT_TOKEN
        if not token:
            logger.warning("bot_reminders: no Telegram token")
            return
        reply_markup = {"inline_keyboard": [
            [{"text": "🔄 Перенести", "callback_data": f"reschedule_appt:{appt_id}"}],
            [{"text": "❌ Отказаться", "callback_data": f"cancel_appt:{appt_id}"}],
        ]}
        from app.services.telegram_bot import TelegramBotService
        svc = TelegramBotService(bot_token=token)
        await svc.send_reply(int(bot_user.chat_id), text, reply_markup=reply_markup)
