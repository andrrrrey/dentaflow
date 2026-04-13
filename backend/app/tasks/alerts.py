"""Celery task for stale-lead alerts.

Runs every 5 minutes via Celery Beat.  Finds communications with
``status='new'`` that are older than 15 minutes and creates a
``Notification`` for each one so the dashboard can surface them.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

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


async def _check_stale_leads_async() -> dict:
    from sqlalchemy import select, and_
    from app.database import async_session_factory
    from app.models.communication import Communication
    from app.models.notification import Notification
    from app.services.realtime import realtime

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)

    async with async_session_factory() as session:
        # Find stale new communications
        stmt = (
            select(Communication)
            .where(
                and_(
                    Communication.status == "new",
                    Communication.created_at < cutoff,
                )
            )
            .order_by(Communication.created_at.asc())
            .limit(50)
        )
        result = await session.execute(stmt)
        stale_comms = result.scalars().all()

        if not stale_comms:
            return {"created_notifications": 0}

        # Check which communications already have a stale_lead notification
        stale_ids = [str(c.id) for c in stale_comms]
        existing_stmt = select(Notification.link).where(
            Notification.type == "stale_lead",
            Notification.link.in_(stale_ids),
        )
        existing_result = await session.execute(existing_stmt)
        already_notified = {row[0] for row in existing_result.all()}

        created = 0
        for comm in stale_comms:
            comm_id_str = str(comm.id)
            if comm_id_str in already_notified:
                continue

            # Calculate how long the lead has been waiting
            age_minutes = int(
                (datetime.now(timezone.utc) - comm.created_at.replace(tzinfo=timezone.utc)).total_seconds() / 60
            ) if comm.created_at else 0

            channel_label = {
                "novofon": "Звонок",
                "telegram": "Telegram",
                "max": "VK/Max",
                "site": "Заявка с сайта",
            }.get(comm.channel, comm.channel)

            notification = Notification(
                type="stale_lead",
                title=f"Не обработано: {channel_label}",
                body=(
                    f"Обращение ({channel_label}) ожидает ответа уже {age_minutes} мин. "
                    f"Содержание: {(comm.content or '')[:100]}"
                ),
                link=comm_id_str,
            )
            session.add(notification)
            created += 1

        if created:
            await session.commit()

            # Notify connected clients
            await realtime.publish("new_notification", {
                "type": "stale_lead",
                "count": created,
            })

        return {"created_notifications": created, "stale_communications": len(stale_comms)}


@celery_app.task(name="app.tasks.alerts.check_stale_leads")
def check_stale_leads():
    """Find stale leads and create notifications."""
    try:
        result = _run_async(_check_stale_leads_async())
        if result["created_notifications"] > 0:
            logger.info(
                "check_stale_leads: created %d notifications for %d stale comms",
                result["created_notifications"],
                result["stale_communications"],
            )
        return result
    except Exception:
        logger.exception("check_stale_leads failed")
        return {"status": "error"}
