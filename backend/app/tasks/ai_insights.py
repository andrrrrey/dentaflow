"""Celery task to refresh AI insights into Redis cache (hourly)."""

from __future__ import annotations

import asyncio
import json
import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

INSIGHTS_CACHE_KEY = "ai:insights:latest"
INSIGHTS_TTL = 3600


def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


async def _refresh_insights_async() -> dict:
    from sqlalchemy import func, select
    from app.config import settings
    from app.database import async_session_factory
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.services.ai_service import AIService

    import redis.asyncio as aioredis

    async with async_session_factory() as session:
        total_patients = (await session.execute(select(func.count(Patient.id)))).scalar_one() or 0
        total_today = (
            await session.execute(
                select(func.count(Appointment.id))
            )
        ).scalar_one() or 0

    kpi = {
        "total_patients": total_patients,
        "appointments_synced": total_today,
    }

    ai = AIService()
    insights = await ai.generate_daily_insights(kpi=kpi)

    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.setex(INSIGHTS_CACHE_KEY, INSIGHTS_TTL, json.dumps(insights, ensure_ascii=False))
        await r.aclose()
    except Exception:
        logger.exception("Failed to cache AI insights in Redis")

    return insights


@celery_app.task(name="app.tasks.ai_insights.refresh_insights", bind=True, max_retries=2)
def refresh_insights(self):
    """Regenerate AI insights and store in Redis."""
    try:
        result = _run_async(_refresh_insights_async())
        logger.info("AI insights refreshed successfully")
        return result
    except Exception as exc:
        logger.exception("refresh_insights failed")
        raise self.retry(exc=exc, countdown=300)
