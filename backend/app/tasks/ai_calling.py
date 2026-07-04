"""Celery-оркестратор ИИ-обзвона.

Два таска:
  * ``tick_campaigns`` (beat, ~раз в минуту) — двигает кампании по статусам,
    уважает расписание/окна и выдаёт свободные слоты на звонки;
  * ``place_call`` — один звонок: создаёт сессию в aicallrobot, инициирует вызов
    через Asterisk (AMI), ждёт исход и пишет результат.

Звонки реально проходят только при поднятом Asterisk с настроенным транком
Novofon. До этого AMI Originate вернёт ошибку → item помечается no_answer/failed.
"""

from __future__ import annotations

import asyncio
import logging

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import async_session_factory
from app.services import ai_calling_service as svc
from app.services.asterisk_ami import AsteriskAMI, AMIError
from app.services.integrations_service import get_raw_value
from app.models.ai_calling import AiCallingCampaign, AiCallingCampaignItem
from app.tasks.celery_app import celery_app
from app.tasks.loop import run_async

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 3.0      # сек между опросами статуса звонка
_MAX_CALL_SECONDS = 300   # потолок ожидания одного разговора


async def _sync_credentials(db) -> None:
    """Пушит ключи Yandex/OpenAI в aicallrobot (как роутер ai_calling)."""
    creds = {
        "yandex_api_key": await get_raw_value(db, "yandex_api_key"),
        "yandex_folder_id": await get_raw_value(db, "yandex_folder_id"),
        "openai_api_key": await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY,
        "openai_model": await get_raw_value(db, "openai_model") or settings.OPENAI_MODEL,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(
                f"{settings.AICALLROBOT_URL}/api/v1/runtime-credentials",
                json={k: v for k, v in creds.items() if v},
            )
    except Exception:  # noqa: BLE001
        logger.warning("Не удалось синхронизировать ключи в aicallrobot", exc_info=True)


# ---------------------------------------------------------------------------
# Диспетчер
# ---------------------------------------------------------------------------

async def _tick() -> dict:
    dispatched = 0
    async with async_session_factory() as db:
        campaigns = (
            await db.execute(
                select(AiCallingCampaign).where(
                    AiCallingCampaign.status.in_(("scheduled", "running", "waiting_window"))
                )
            )
        ).scalars().all()

        for c in campaigns:
            # 1. Запланированная — стартуем по времени.
            if c.status == "scheduled":
                if not svc.schedule_reached(c):
                    continue
                c.status = "running"
                from datetime import datetime, timezone
                if c.started_at is None:
                    c.started_at = datetime.now(timezone.utc)

            # 2. Окно обзвона.
            if not svc.is_within_window(c):
                if c.status != "waiting_window":
                    c.status = "waiting_window"
                    await db.commit()
                continue
            if c.status == "waiting_window":
                c.status = "running"

            await db.commit()

            # 3. Завершение.
            pending = await svc.count_pending(db, c.id)
            in_flight = await svc.count_in_flight(db, c.id)
            if pending == 0 and in_flight == 0:
                from datetime import datetime, timezone
                c.status = "completed"
                c.ended_at = datetime.now(timezone.utc)
                await db.commit()
                continue

            # 4. Свободные слоты → выдаём звонки.
            slots = max(0, c.max_concurrent - in_flight)
            claimed = await svc.claim_pending_items(db, c.id, slots)
            for item_id in claimed:
                place_call.delay(str(item_id))
                dispatched += 1

    return {"dispatched": dispatched}


@celery_app.task(name="app.tasks.ai_calling.tick_campaigns")
def tick_campaigns():
    return run_async(_tick())


# ---------------------------------------------------------------------------
# Один звонок
# ---------------------------------------------------------------------------

async def _place_call(item_id: str) -> dict:
    async with async_session_factory() as db:
        item = (
            await db.execute(
                select(AiCallingCampaignItem).where(AiCallingCampaignItem.id == item_id)
            )
        ).scalar_one_or_none()
        if item is None or item.status != "calling":
            return {"skipped": True}

        campaign = await svc.get_campaign(db, item.campaign_id)
        if campaign is None or campaign.status == "cancelled":
            return {"skipped": True}
        scenario_id = campaign.scenario_id
        phone = item.phone

        await _sync_credentials(db)
        caller_id = await get_raw_value(db, "novofon_caller_id")
        ami_password = await get_raw_value(db, "novofon_ami_password")

    # 1. Создаём сессию диалога в aicallrobot.
    call_id = None
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.AICALLROBOT_URL}/api/v1/calls/start",
                json={"phone_number": phone, "scenario_id": scenario_id, "algo_version": "v2"},
            )
            resp.raise_for_status()
            call_id = resp.json().get("call_id")
    except Exception as exc:  # noqa: BLE001
        logger.error("aicallrobot calls/start failed: %s", exc)
        async with async_session_factory() as db:
            await svc.record_call_result(db, item.id, status="failed", outcome="start_error")
        return {"status": "failed"}

    # 2. Инициируем телефонный вызов через Asterisk (AMI).
    try:
        ok, _reason = await AsteriskAMI(password=ami_password or None).originate(phone=svc.normalize_phone(phone), call_id=call_id, caller_id=svc.normalize_phone(caller_id) or None)
    except AMIError as exc:
        logger.error("AMI originate failed: %s", exc)
        ok = False

    if not ok:
        async with async_session_factory() as db:
            await svc.record_call_result(db, item.id, status="no_answer", call_id=call_id)
        return {"status": "no_answer"}

    # 3. Ждём завершения разговора и читаем исход из aicallrobot.
    result = await _await_call_outcome(call_id)

    async with async_session_factory() as db:
        await svc.record_call_result(
            db,
            item.id,
            status="done" if result.get("transcript") else "no_answer",
            call_id=call_id,
            outcome=result.get("client_status"),
            summary=result.get("summary"),
            duration_sec=result.get("duration"),
            transcript=result.get("transcript"),
        )
    return {"status": "done", "call_id": call_id}


async def _await_call_outcome(call_id: str) -> dict:
    """Опрашивает aicallrobot, пока звонок не завершится (или таймаут)."""
    waited = 0.0
    last: dict = {}
    async with httpx.AsyncClient(timeout=20.0) as client:
        while waited < _MAX_CALL_SECONDS:
            try:
                resp = await client.get(f"{settings.AICALLROBOT_URL}/api/v1/calls/{call_id}")
                if resp.status_code == 200:
                    last = resp.json()
                    if last.get("status") == "completed":
                        return last
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(_POLL_INTERVAL)
            waited += _POLL_INTERVAL
    return last


@celery_app.task(name="app.tasks.ai_calling.place_call", bind=True, max_retries=0)
def place_call(self, item_id: str):
    return run_async(_place_call(item_id))
