"""ИИ обзвон — прокси к сервису aicallrobot (только для роли owner).

Бэкенд DentaFlow проксирует запросы UI к отдельному сервису aicallrobot
(Тест TTS, Тест диалога v2.0, Скрипты диалога) и прокидывает туда учётные
данные (Yandex SpeechKit + OpenAI), которые владелец задаёт в настройках
интеграций. Голосовой тест диалога проксируется через WebSocket-релей.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

import httpx
import websockets
from fastapi import APIRouter, Depends, Header, HTTPException, Request, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory, get_db
from app.dependencies import role_required
from app.models.user import User
from pydantic import BaseModel
from datetime import datetime
from app.services import ai_calling_service
from app.services.integrations_service import get_raw_value
from app.utils.security import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai-calling", tags=["ai-calling"])

_TIMEOUT = httpx.Timeout(30.0, connect=5.0)


# ── Учётные данные → aicallrobot ────────────────────────────────────────────────

async def _collect_credentials(db: AsyncSession) -> dict:
    """Собирает ключи из настроек интеграций (с фоллбэком на env)."""
    yandex_api_key = await get_raw_value(db, "yandex_api_key")
    yandex_folder_id = await get_raw_value(db, "yandex_folder_id")
    openai_api_key = await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY
    openai_model = await get_raw_value(db, "openai_model") or settings.OPENAI_MODEL
    return {
        "yandex_api_key": yandex_api_key,
        "yandex_folder_id": yandex_folder_id,
        "openai_api_key": openai_api_key,
        "openai_model": openai_model,
    }


async def _sync_credentials(db: AsyncSession) -> None:
    """Пушит актуальные ключи в aicallrobot перед операцией, требующей их."""
    creds = await _collect_credentials(db)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            await client.post(
                f"{settings.AICALLROBOT_URL}/api/v1/runtime-credentials",
                json={k: v for k, v in creds.items() if v},
            )
    except Exception:
        logger.warning("Failed to sync credentials to aicallrobot", exc_info=True)


# ── Общий HTTP-прокси ──────────────────────────────────────────────────────────

async def _proxy(method: str, path: str, *, json: dict | None = None, params: dict | None = None):
    url = f"{settings.AICALLROBOT_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.request(method, url, json=json, params=params)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"aicallrobot недоступен: {e}")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])
    try:
        return resp.json()
    except ValueError:
        return resp.text


# ── Внутренний эндпоинт: SIP-настройки Novofon для медиасервера (Asterisk) ───────
# Источник истины — админка «Интеграции» (таблица IntegrationSetting), НЕ .env.
# Доступ только внутри docker-сети по общему секрету INTERNAL_API_TOKEN; наружу
# через nginx не публикуется.

@router.get("/internal/novofon-sip")
async def internal_novofon_sip(
    x_internal_token: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
):
    if not settings.INTERNAL_API_TOKEN or x_internal_token != settings.INTERNAL_API_TOKEN:
        raise HTTPException(status_code=403, detail="forbidden")
    return {
        "sip_login": await get_raw_value(db, "novofon_sip_login"),
        "sip_password": await get_raw_value(db, "novofon_sip_password"),
        "sip_server": await get_raw_value(db, "novofon_sip_server"),
        "caller_id": await get_raw_value(db, "novofon_caller_id"),
    }


# ── Тест TTS ────────────────────────────────────────────────────────────────────

@router.post("/tts-test")
async def tts_test(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(role_required("owner")),
):
    await _sync_credentials(db)
    return await _proxy("POST", "/api/v1/tts", json=body)


@router.get("/voices")
async def voices(_user: User = Depends(role_required("owner"))):
    return await _proxy("GET", "/api/v1/voices")


# ── Тест диалога (v2.0, текстовый) ──────────────────────────────────────────────

@router.post("/dialog/start")
async def dialog_start(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(role_required("owner")),
):
    await _sync_credentials(db)
    return await _proxy("POST", "/api/v1/ai/chat_v2/start", json=body)


@router.post("/dialog/turn")
async def dialog_turn(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(role_required("owner")),
):
    await _sync_credentials(db)
    return await _proxy("POST", "/api/v1/ai/chat_v2/turn", json=body)


@router.delete("/dialog/session/{session_id}")
async def dialog_delete_session(
    session_id: str,
    _user: User = Depends(role_required("owner")),
):
    return await _proxy("DELETE", f"/api/v1/ai/chat_v2/session/{session_id}")


# ── Голосовой тест диалога: создание сессии (call_id для WebSocket) ──────────────

@router.post("/calls/start")
async def calls_start(
    body: dict | None = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(role_required("owner")),
):
    await _sync_credentials(db)
    payload = {
        "phone_number": (body or {}).get("phone_number", "dentaflow-owner"),
        "scenario_id": (body or {}).get("scenario_id", "default"),
        "algo_version": "v2",
    }
    return await _proxy("POST", "/api/v1/calls/start", json=payload)


# ── Скрипты диалога ─────────────────────────────────────────────────────────────

@router.get("/scenarios")
async def scenarios(_user: User = Depends(role_required("owner"))):
    return await _proxy("GET", "/api/v1/scenarios")


@router.get("/scenarios/{scenario_id}")
async def scenario_detail(scenario_id: str, _user: User = Depends(role_required("owner"))):
    return await _proxy("GET", f"/api/v1/scenarios/{scenario_id}")


@router.get("/script-corrections")
async def list_corrections(_user: User = Depends(role_required("owner"))):
    return await _proxy("GET", "/api/v1/script-corrections")


@router.post("/script-corrections")
async def add_correction(body: dict, _user: User = Depends(role_required("owner"))):
    return await _proxy("POST", "/api/v1/script-corrections", json=body)


@router.put("/script-corrections/{item_id}")
async def update_correction(item_id: str, body: dict, _user: User = Depends(role_required("owner"))):
    return await _proxy("PUT", f"/api/v1/script-corrections/{item_id}", json=body)


@router.delete("/script-corrections/{item_id}")
async def delete_correction(item_id: str, _user: User = Depends(role_required("owner"))):
    return await _proxy("DELETE", f"/api/v1/script-corrections/{item_id}")


# ── Голосовой тест диалога: WebSocket-релей ─────────────────────────────────────

def _upstream_ws_url(call_id: str) -> str:
    base = settings.AICALLROBOT_URL
    if base.startswith("https://"):
        base = "wss://" + base[len("https://"):]
    elif base.startswith("http://"):
        base = "ws://" + base[len("http://"):]
    return f"{base}/ws/audio/{call_id}"


async def _authorize_ws_owner(token: str) -> bool:
    """Проверяет, что токен валиден и пользователь — owner."""
    try:
        payload = decode_token(token)
    except Exception:
        return False
    if payload.get("type") != "access":
        return False
    user_id = payload.get("sub")
    if not user_id:
        return False
    try:
        user_uuid = uuid.UUID(user_id)
    except (ValueError, AttributeError):
        return False
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()
        return bool(user and user.is_active and user.role == "owner")


@router.websocket("/ws/audio/{call_id}")
async def ws_audio_relay(websocket: WebSocket, call_id: str, token: str = Query(...)):
    if not await _authorize_ws_owner(token):
        await websocket.close(code=4001)
        return

    # Прокидываем актуальные ключи перед звонком.
    async with async_session_factory() as db:
        await _sync_credentials(db)

    await websocket.accept()
    upstream_url = _upstream_ws_url(call_id)
    try:
        async with websockets.connect(upstream_url, max_size=None) as upstream:
            await asyncio.gather(
                _pump_client_to_upstream(websocket, upstream),
                _pump_upstream_to_client(upstream, websocket),
            )
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("WS relay error for call %s: %s", call_id, e)
        try:
            await websocket.close()
        except Exception:
            pass


async def _pump_client_to_upstream(client: WebSocket, upstream) -> None:
    try:
        while True:
            data = await client.receive()
            if data.get("type") == "websocket.disconnect":
                await upstream.close()
                return
            if data.get("bytes") is not None:
                await upstream.send(data["bytes"])
            elif data.get("text") is not None:
                await upstream.send(data["text"])
    except WebSocketDisconnect:
        await upstream.close()
    except Exception:
        await upstream.close()


async def _pump_upstream_to_client(upstream, client: WebSocket) -> None:
    try:
        async for message in upstream:
            if isinstance(message, (bytes, bytearray)):
                await client.send_bytes(bytes(message))
            else:
                await client.send_text(message)
    except Exception:
        try:
            await client.close()
        except Exception:
            pass


# ── Кампании ИИ-обзвона (B4–B6) ───────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str
    segment_key: str
    scenario_id: str = "default"
    max_concurrent: int = 1
    scheduled_at: datetime | None = None
    window_start: str | None = None  # "09:00"
    window_end: str | None = None    # "20:00"
    timezone: str = "Europe/Moscow"


class CampaignControl(BaseModel):
    action: str  # start | pause | resume | cancel


def _campaign_dict(c) -> dict:
    total = c.total or 0
    progress = int(round((c.completed / total) * 100)) if total else 0
    return {
        "id": str(c.id),
        "name": c.name,
        "segment_key": c.segment_key,
        "scenario_id": c.scenario_id,
        "status": c.status,
        "max_concurrent": c.max_concurrent,
        "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None,
        "window_start": c.window_start,
        "window_end": c.window_end,
        "timezone": c.timezone,
        "total": total,
        "completed": c.completed,
        "succeeded": c.succeeded,
        "failed": c.failed,
        "progress": progress,
        "started_at": c.started_at.isoformat() if c.started_at else None,
        "ended_at": c.ended_at.isoformat() if c.ended_at else None,
        "error": c.error,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _item_dict(i) -> dict:
    return {
        "id": str(i.id),
        "patient_id": str(i.patient_id) if i.patient_id else None,
        "phone": i.phone,
        "status": i.status,
        "outcome": i.outcome,
        "summary": i.summary,
        "duration_sec": i.duration_sec,
        "attempts": i.attempts,
        "updated_at": i.updated_at.isoformat() if i.updated_at else None,
    }


@router.get("/campaigns")
async def campaigns_list(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(role_required("owner")),
):
    items = await ai_calling_service.list_campaigns(db)
    return {"items": [_campaign_dict(c) for c in items]}


@router.post("/campaigns")
async def campaigns_create(
    body: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(role_required("owner")),
):
    campaign = await ai_calling_service.create_campaign(
        db,
        name=body.name,
        segment_key=body.segment_key,
        scenario_id=body.scenario_id,
        max_concurrent=body.max_concurrent,
        scheduled_at=body.scheduled_at,
        window_start=body.window_start,
        window_end=body.window_end,
        tz=body.timezone,
        created_by=user.id,
    )
    if campaign.total == 0:
        raise HTTPException(
            status_code=400,
            detail="В выбранном сегменте нет пациентов с телефоном",
        )
    return _campaign_dict(campaign)


@router.get("/campaigns/{campaign_id}")
async def campaign_get(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(role_required("owner")),
):
    campaign = await ai_calling_service.get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    return _campaign_dict(campaign)


@router.get("/campaigns/{campaign_id}/items")
async def campaign_items(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(role_required("owner")),
):
    items = await ai_calling_service.list_items(db, campaign_id)
    return {"items": [_item_dict(i) for i in items]}


@router.post("/campaigns/{campaign_id}/control")
async def campaign_control(
    campaign_id: uuid.UUID,
    body: CampaignControl,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(role_required("owner")),
):
    if body.action not in ("start", "pause", "resume", "cancel"):
        raise HTTPException(status_code=400, detail="Недопустимое действие")
    campaign = await ai_calling_service.control_campaign(db, campaign_id, body.action)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    return _campaign_dict(campaign)
