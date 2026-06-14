"""Celery tasks for recomputing patient segments (saved lists).

Triggered on-demand from the UI ("Обновить"). The AI-driven segments
(unfinished treatment, missed consultation) share one analysis pass, so a
single task call recomputes both.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import update

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


from app.tasks.loop import run_async as _run_async  # noqa: E402


async def _recompute_async(key: str) -> dict:
    from app.database import async_session_factory
    from app.services import segments_service as svc

    async with async_session_factory() as db:
        seg = await svc.get_segment_by_key(db, key)
        if seg is None:
            return {"status": "error", "detail": "segment not found", "key": key}
        if seg.kind == "manual":
            return {"status": "skipped", "detail": "manual segment", "key": key}

    # recompute_ai_segments manages its own short-lived sessions.
    try:
        return await svc.recompute_ai_segments()
    except Exception as exc:  # noqa: BLE001
        logger.exception("recompute_segment failed for %s", key)
        # Mark all AI segments as errored so the UI stops spinning — use a
        # fresh session, the original one may be stale after a long run.
        try:
            async with async_session_factory() as db2:
                await db2.execute(
                    update(svc.PatientSegment)
                    .where(svc.PatientSegment.key.in_(list(svc.AI_SEGMENT_KEYS)))
                    .values(status="error", error=str(exc)[:500])
                )
                await db2.commit()
        except Exception:  # noqa: BLE001
            logger.exception("failed to mark segments errored for %s", key)
        return {"status": "error", "detail": str(exc), "key": key}


@celery_app.task(name="app.tasks.segments.recompute_segment", bind=True, max_retries=0)
def recompute_segment(self, key: str):
    """Recompute a patient segment by key."""
    result = _run_async(_recompute_async(key))
    logger.info("recompute_segment(%s): %s", key, result)
    return result
