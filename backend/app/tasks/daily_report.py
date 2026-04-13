"""Celery task for sending the nightly Telegram report.

Runs daily at 20:00 Moscow time via Celery Beat.  Aggregates the day's
KPI from the database (or uses mock data in dev mode) and sends the
summary to the clinic owner's Telegram chat.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.tasks.celery_app import celery_app
from app.config import settings

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


async def _aggregate_kpi() -> dict:
    """Build the daily KPI dict from the database."""
    from sqlalchemy import select, func as sql_func
    from app.database import async_session_factory
    from app.models.communication import Communication
    from app.models.appointment import Appointment
    from app.models.patient import Patient

    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = day_start + timedelta(days=1)
    tomorrow_end = tomorrow_start + timedelta(days=1)

    async with async_session_factory() as session:
        # New patients today
        new_patients_q = await session.execute(
            select(sql_func.count(Patient.id)).where(
                Patient.created_at >= day_start,
                Patient.is_new_patient.is_(True),
            )
        )
        new_patients = new_patients_q.scalar() or 0

        # Calls today
        calls_total_q = await session.execute(
            select(sql_func.count(Communication.id)).where(
                Communication.channel == "novofon",
                Communication.created_at >= day_start,
            )
        )
        calls_total = calls_total_q.scalar() or 0

        # Missed calls
        calls_missed_q = await session.execute(
            select(sql_func.count(Communication.id)).where(
                Communication.channel == "novofon",
                Communication.type == "missed_call",
                Communication.created_at >= day_start,
            )
        )
        calls_missed = calls_missed_q.scalar() or 0

        # Messages today (all channels except novofon)
        messages_total_q = await session.execute(
            select(sql_func.count(Communication.id)).where(
                Communication.channel != "novofon",
                Communication.type == "message",
                Communication.created_at >= day_start,
            )
        )
        messages_total = messages_total_q.scalar() or 0

        # Appointments today
        appts_today_q = await session.execute(
            select(sql_func.count(Appointment.id)).where(
                Appointment.scheduled_at >= day_start,
                Appointment.scheduled_at < tomorrow_start,
            )
        )
        appointments_today = appts_today_q.scalar() or 0

        # Appointments tomorrow
        appts_tomorrow_q = await session.execute(
            select(sql_func.count(Appointment.id)).where(
                Appointment.scheduled_at >= tomorrow_start,
                Appointment.scheduled_at < tomorrow_end,
            )
        )
        appointments_tomorrow = appts_tomorrow_q.scalar() or 0

        # Revenue today
        revenue_q = await session.execute(
            select(sql_func.coalesce(sql_func.sum(Appointment.revenue), 0)).where(
                Appointment.scheduled_at >= day_start,
                Appointment.scheduled_at < tomorrow_start,
                Appointment.status == "completed",
            )
        )
        revenue = float(revenue_q.scalar() or 0)

        # Stale leads (new communications older than 15 min)
        stale_cutoff = now - timedelta(minutes=15)
        stale_q = await session.execute(
            select(sql_func.count(Communication.id)).where(
                Communication.status == "new",
                Communication.created_at < stale_cutoff,
            )
        )
        stale_leads = stale_q.scalar() or 0

    # Conversion rate (rough: patients with appointments / total new comms)
    conversion_rate = 0.0
    if calls_total + messages_total > 0:
        conversion_rate = (appointments_today / (calls_total + messages_total)) * 100

    return {
        "new_patients": new_patients,
        "calls_total": calls_total,
        "calls_missed": calls_missed,
        "messages_total": messages_total,
        "appointments_today": appointments_today,
        "appointments_tomorrow": appointments_tomorrow,
        "revenue": revenue,
        "conversion_rate": round(conversion_rate, 1),
        "stale_leads": stale_leads,
    }


async def _send_report_async() -> dict:
    from app.services.telegram_bot import TelegramBotService
    from app.services.ai_service import AIService

    kpi = await _aggregate_kpi()

    # Generate AI insights
    ai_svc = AIService()
    insights = await ai_svc.generate_daily_insights(kpi)
    kpi["ai_insights"] = insights.get("summary", "")

    # Send via Telegram
    chat_id = settings.OWNER_TELEGRAM_CHAT_ID
    if not chat_id:
        logger.warning("OWNER_TELEGRAM_CHAT_ID not set, skipping daily report")
        return {"status": "skipped", "reason": "no chat_id", "kpi": kpi}

    tg = TelegramBotService()
    await tg.send_daily_report(int(chat_id), kpi)

    return {"status": "sent", "chat_id": chat_id, "kpi": kpi}


@celery_app.task(name="app.tasks.daily_report.send_daily_report", bind=True, max_retries=2)
def send_daily_report(self):
    """Aggregate KPI and send the daily Telegram report."""
    try:
        result = _run_async(_send_report_async())
        logger.info("Daily report: %s", result.get("status"))
        return result
    except Exception as exc:
        logger.exception("send_daily_report failed")
        raise self.retry(exc=exc, countdown=120)
