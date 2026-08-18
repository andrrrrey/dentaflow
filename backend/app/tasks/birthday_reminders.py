"""Celery-задача: напоминания о днях рождения сотрудников и врачей за 1 день.

Раз в сутки создаёт уведомления в колокольчик и задачи для администраторов
по тем, у кого день рождения завтра.
"""

from __future__ import annotations

import logging

from app.tasks.celery_app import celery_app
from app.tasks.loop import run_async as _run_async

logger = logging.getLogger(__name__)


async def _create_birthday_reminders_async() -> dict:
    from app.database import async_session_factory
    from app.services.tasks_service import create_birthday_reminders_for_tomorrow

    async with async_session_factory() as session:
        return await create_birthday_reminders_for_tomorrow(session)


@celery_app.task(name="app.tasks.birthday_reminders.create_birthday_reminders", bind=True, max_retries=3)
def create_birthday_reminders(self):
    """Создать напоминания о завтрашних днях рождения. Runs at 03:10 Moscow."""
    try:
        result = _run_async(_create_birthday_reminders_async())
        logger.info(
            "create_birthday_reminders complete: created=%d skipped=%d",
            result.get("created", 0),
            result.get("skipped", 0),
        )
        return result
    except Exception as exc:
        logger.exception("create_birthday_reminders failed")
        raise self.retry(exc=exc, countdown=120)
