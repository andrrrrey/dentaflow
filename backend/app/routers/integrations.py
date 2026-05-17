"""Integrations settings router."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
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


@router.post("/check/{service}")
async def check_integration(
    service: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    webhook_url = _max_webhook_url(request) if service == "max_vk" else None
    return await check_connection(service, db, webhook_url=webhook_url)
