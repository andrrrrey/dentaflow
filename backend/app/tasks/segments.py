"""Celery tasks for recomputing patient segments (saved lists).

Triggered on-demand from the UI ("Обновить"). The AI-driven segments
(unfinished treatment, missed consultation) share one analysis pass, so a
single task call recomputes both.
"""

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


async def _recompute_async(key: str) -> dict:
    from app.database import async_session_factory
    from app.services import segments_service as svc

    async with async_session_factory() as db:
        seg = await svc.get_segment_by_key(db, key)
        if seg is None:
            return {"status": "error", "detail": "segment not found", "key": key}
        if seg.kind == "manual":
            return {"status": "skipped", "detail": "manual segment", "key": key}

        try:
            if seg.kind == "dynamic_ai":
                return await svc.recompute_ai_segments(db)
            return await svc.recompute_hygiene(db)
        except Exception as exc:  # noqa: BLE001
            logger.exception("recompute_segment failed for %s", key)
            # Mark the segment(s) as errored so the UI stops spinning.
            keys = svc.AI_SEGMENT_KEYS if seg.kind == "dynamic_ai" else (key,)
            for k in keys:
                s = await svc.get_segment_by_key(db, k)
                if s is not None:
                    s.status = "error"
                    s.error = str(exc)[:500]
            await db.commit()
            return {"status": "error", "detail": str(exc), "key": key}


@celery_app.task(name="app.tasks.segments.recompute_segment", bind=True, max_retries=0)
def recompute_segment(self, key: str):
    """Recompute a patient segment by key."""
    result = _run_async(_recompute_async(key))
    logger.info("recompute_segment(%s): %s", key, result)
    return result
