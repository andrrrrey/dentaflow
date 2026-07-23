import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import (
    ai,
    ai_calling,
    auth,
    calls,
    communications,
    dashboard,
    deals,
    directories,
    doctors,
    integrations,
    knowledge_base,
    loyalty,
    marketing,
    notifications,
    patient_segments,
    patients,
    pipeline_ext,
    pipeline_stages,
    reports,
    rewards,
    schedule,
    scripts,
    search,
    staff,
    tasks,
    webhooks,
    ws,
)


logger = logging.getLogger(__name__)


async def _register_telegram_commands() -> None:
    """Регистрируем меню команд Telegram при старте, чтобы новые пункты
    (/history, /bonus и т.д.) появлялись сразу после деплоя, не дожидаясь
    входящего апдейта."""
    try:
        from app.database import async_session_factory
        from app.services.integrations_service import get_raw_value
        from app.services.telegram_bot import TelegramBotService

        async with async_session_factory() as db:
            token = await get_raw_value(db, "telegram_bot_token") or settings.TELEGRAM_BOT_TOKEN
        if not token:
            return
        await TelegramBotService(bot_token=token).set_my_commands()
        logger.info("Telegram bot commands registered on startup")
    except Exception:
        logger.warning("Failed to register Telegram commands on startup", exc_info=True)


async def _realtime_ws_bridge() -> None:
    """Мост Redis Pub/Sub → WebSocket.

    События (`realtime.publish`) публикуются в Redis-канал и здесь
    ретранслируются всем подключённым по WebSocket клиентам этого воркера.
    Без этого моста live-обновления (счётчики, колокольчик, пуши) не доходили
    бы до браузера — при нескольких uvicorn-воркерах каждый держит свои
    WS-соединения, а Redis раздаёт событие во все воркеры сразу.
    """
    from app.routers.ws import manager
    from app.services.realtime import realtime

    while True:  # переподключаемся после сбоев Redis, не теряя live-обновления
        pubsub = await realtime.subscribe()
        if pubsub is None:
            logger.warning("Realtime→WS bridge: Redis unavailable, retry in 5s")
            await asyncio.sleep(5)
            continue
        logger.info("Realtime→WS bridge started")
        try:
            async for message in pubsub.listen():
                if not message or message.get("type") != "message":
                    continue
                try:
                    event = json.loads(message.get("data"))
                except (TypeError, ValueError):
                    continue
                await manager.broadcast(event)
        except asyncio.CancelledError:
            try:
                await pubsub.unsubscribe(realtime.CHANNEL)
                await pubsub.close()
            except Exception:
                pass
            raise  # штатная остановка при shutdown
        except Exception:
            logger.warning("Realtime→WS bridge dropped, reconnecting in 5s", exc_info=True)
            try:
                await pubsub.close()
            except Exception:
                pass
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("DentaFlow backend starting up")
    from app.services.realtime import realtime

    await realtime.connect()
    bridge_task = asyncio.create_task(_realtime_ws_bridge())
    await _register_telegram_commands()
    yield
    logger.info("DentaFlow backend shutting down")
    bridge_task.cancel()
    try:
        await bridge_task
    except asyncio.CancelledError:
        pass
    await realtime.disconnect()


app = FastAPI(
    title="DentaFlow API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check
@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


# --- Routers ---
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(deals.router)
app.include_router(communications.router)
app.include_router(patients.router)
app.include_router(patient_segments.router)
app.include_router(ws.router)
app.include_router(tasks.router)
app.include_router(notifications.router)
app.include_router(schedule.router)
app.include_router(doctors.router)
app.include_router(calls.router)
app.include_router(pipeline_ext.router)
app.include_router(search.router)
app.include_router(ai.router)
app.include_router(ai_calling.router)
app.include_router(staff.router)
app.include_router(integrations.router)
app.include_router(scripts.router)
app.include_router(directories.router)
app.include_router(reports.router)
app.include_router(pipeline_stages.router)
app.include_router(marketing.router)
app.include_router(webhooks.router)
app.include_router(knowledge_base.router)
app.include_router(rewards.router)
app.include_router(loyalty.router)

# --- Static files (avatars, uploads) ---
_static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
os.makedirs(_static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=_static_dir), name="static")

# --- Future routers ---
# app.include_router(appointments.router, prefix="/api/v1/appointments", tags=["appointments"])
# app.include_router(calls.router, prefix="/api/v1/calls", tags=["calls"])
# app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
# app.include_router(telegram.router, prefix="/api/v1/telegram", tags=["telegram"])
