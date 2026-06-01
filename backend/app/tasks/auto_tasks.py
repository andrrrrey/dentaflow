"""Celery tasks for auto-generating daily patient call tasks."""

from __future__ import annotations

import asyncio
import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


async def _create_daily_call_tasks_async() -> dict:
    from app.database import async_session_factory
    from app.services.tasks_service import create_auto_tasks_for_today

    async with async_session_factory() as session:
        return await create_auto_tasks_for_today(session)


async def _deactivate_expired_tasks_async() -> dict:
    from app.database import async_session_factory
    from app.services.tasks_service import deactivate_expired_tasks

    async with async_session_factory() as session:
        return await deactivate_expired_tasks(session)


async def _create_yesterday_followup_tasks_async() -> dict:
    """Fetch yesterday's visits from 1Denta and create tasks for those without records."""
    from datetime import date, timedelta, datetime, timezone
    from app.database import async_session_factory
    from app.services.tasks_service import create_yesterday_followup_tasks
    from app.services.one_denta import OneDentaService

    service = await OneDentaService.from_db_session_factory()

    if service._no_credentials():
        logger.info("create_yesterday_followup_tasks: 1Denta credentials not configured, skipping")
        return {"created": 0, "skipped": 0, "reason": "no_credentials"}

    today = date.today()
    yesterday = today - timedelta(days=1)
    yesterday_dt = datetime(yesterday.year, yesterday.month, yesterday.day, tzinfo=timezone.utc)
    today_dt = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

    try:
        one_denta_visits = await service.get_appointments(
            date_from=yesterday_dt,
            date_to=today_dt,
        )
        logger.info(
            "create_yesterday_followup_tasks: fetched %d visits from 1Denta for %s",
            len(one_denta_visits),
            yesterday.isoformat(),
        )
    except Exception as exc:
        logger.exception("create_yesterday_followup_tasks: failed to fetch visits from 1Denta")
        return {"created": 0, "skipped": 0, "error": str(exc)}

    async with async_session_factory() as session:
        return await create_yesterday_followup_tasks(session, one_denta_visits)


@celery_app.task(name="app.tasks.auto_tasks.create_daily_call_tasks", bind=True, max_retries=3)
def create_daily_call_tasks(self):
    """Create call tasks for today's appointments. Runs at 07:00 Moscow."""
    try:
        result = _run_async(_create_daily_call_tasks_async())
        logger.info(
            "create_daily_call_tasks complete: created=%d skipped=%d",
            result.get("created", 0),
            result.get("skipped", 0),
        )
        return result
    except Exception as exc:
        logger.exception("create_daily_call_tasks failed")
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.auto_tasks.deactivate_expired_tasks", bind=True, max_retries=3)
def deactivate_expired_tasks(self):
    """Mark uncompleted auto tasks from previous days as inactive. Runs at 00:05 Moscow."""
    try:
        result = _run_async(_deactivate_expired_tasks_async())
        logger.info(
            "deactivate_expired_tasks complete: deactivated=%d",
            result.get("deactivated", 0),
        )
        return result
    except Exception as exc:
        logger.exception("deactivate_expired_tasks failed")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.auto_tasks.create_yesterday_followup_tasks", bind=True, max_retries=3)
def create_yesterday_followup_tasks(self):
    """Create follow-up tasks for yesterday's appointments. Runs at 08:00 Moscow."""
    try:
        result = _run_async(_create_yesterday_followup_tasks_async())
        logger.info(
            "create_yesterday_followup_tasks complete: created=%d skipped=%d",
            result.get("created", 0),
            result.get("skipped", 0),
        )
        return result
    except Exception as exc:
        logger.exception("create_yesterday_followup_tasks failed")
        raise self.retry(exc=exc, countdown=120)
