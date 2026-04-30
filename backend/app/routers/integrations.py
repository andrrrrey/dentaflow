"""Integrations settings router."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.integrations_service import (
    check_connection,
    get_masked_settings,
    save_settings,
)

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


@router.get("/")
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    settings = await get_masked_settings(db)
    return {"settings": settings}


@router.put("/")
async def update_integrations(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    await save_settings(db, body.get("settings", body))
    return {"ok": True}


@router.post("/check/{service}")
async def check_integration(
    service: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    return await check_connection(service, db)
