"""Integrations settings router."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.integrations_service import (
    check_connection,
    get_masked_settings,
    get_raw_value,
    save_settings,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


def _max_webhook_url(request: Request) -> str:
    # Respect X-Forwarded-Proto / Host set by nginx
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}/api/v1/webhooks/max"


@router.get("/")
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    settings = await get_masked_settings(db)
    return {"settings": settings}


@router.put("/")
async def update_integrations(
    request: Request,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    settings_data = body.get("settings", body)
    await save_settings(db, settings_data)

    # Auto-register Max webhook whenever a non-masked token is saved
    new_token = settings_data.get("max_bot_token", "")
    if new_token and "*" not in new_token:
        from app.services.max_vk import MaxVkService
        webhook_url = _max_webhook_url(request)
        try:
            svc = MaxVkService(bot_token=new_token.strip())
            await svc.register_webhook(webhook_url)
            logger.info("Max webhook auto-registered: %s", webhook_url)
        except Exception:
            logger.warning("Max webhook auto-registration failed (will retry on next check)")

    return {"ok": True}


@router.post("/sync-1denta")
async def sync_one_denta(
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Owner-only: trigger a full 1Denta sync in the background.

    Replaces the per-section "Синхронизировать" buttons — the whole app now
    auto-syncs hourly, and this is the single manual "refresh everything" action
    available to the clinic owner. Runs asynchronously via Celery so the request
    returns immediately and never times out on large clinics.
    """
    if _current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может запускать синхронизацию")

    from app.tasks.sync_1denta import sync_full_daily

    try:
        sync_full_daily.delay()
    except Exception:
        logger.exception("Failed to enqueue 1Denta full sync")
        raise HTTPException(status_code=503, detail="Не удалось запустить синхронизацию (очередь недоступна)")

    return {"status": "started"}


@router.get("/sync-1denta/status")
async def one_denta_sync_status(
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return the last 1Denta sync outcome and the estimated next run time.

    Powers the status block in Settings → 1Denta (CRM). Best-effort: if Redis
    is unavailable, returns empty fields rather than erroring.
    """
    import json
    from datetime import datetime, timedelta, timezone

    from app.config import settings
    from app.tasks.celery_app import celery_app
    from app.tasks.sync_1denta import _REDIS_LAST_HOURLY_KEY, _REDIS_LAST_SYNC_KEY

    empty = {
        "last_sync_at": None,
        "last_trigger": None,
        "ok": None,
        "error": None,
        "result": None,
        "next_sync_at": None,
    }

    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            last_raw = await r.get(_REDIS_LAST_SYNC_KEY)
            last_hourly = await r.get(_REDIS_LAST_HOURLY_KEY)
        finally:
            await r.aclose()
    except Exception:
        logger.warning("Failed to read 1Denta sync status from Redis", exc_info=True)
        return empty

    if not last_raw:
        # No sync recorded yet, but we can still estimate the next hourly run.
        last_hourly = last_hourly or None

    data = {}
    if last_raw:
        try:
            data = json.loads(last_raw)
        except (ValueError, TypeError):
            data = {}

    # Estimate next automatic run from the last hourly sync + the beat interval.
    next_sync_at = None
    try:
        interval = celery_app.conf.beat_schedule.get("sync-1denta-hourly", {}).get("schedule", 3600.0)
        interval = float(interval)
    except Exception:
        interval = 3600.0
    if last_hourly:
        try:
            base = datetime.fromisoformat(last_hourly)
            if base.tzinfo is None:
                base = base.replace(tzinfo=timezone.utc)
            nxt = base + timedelta(seconds=interval)
            # If the estimate is already in the past (beat missed / just booting),
            # roll forward to the next whole interval from now.
            now = datetime.now(timezone.utc)
            while nxt < now:
                nxt = nxt + timedelta(seconds=interval)
            next_sync_at = nxt.isoformat()
        except (ValueError, TypeError):
            next_sync_at = None

    return {
        "last_sync_at": data.get("finished_at"),
        "last_trigger": data.get("trigger"),
        "ok": data.get("ok"),
        "error": data.get("error"),
        "result": data.get("result"),
        "next_sync_at": next_sync_at,
    }


@router.post("/check/{service}")
async def check_integration(
    service: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    webhook_url = _max_webhook_url(request) if service == "max_vk" else None
    return await check_connection(service, db, webhook_url=webhook_url)
