"""Directories / reference data from 1Denta."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.one_denta import OneDentaService

router = APIRouter(prefix="/api/v1/directories", tags=["directories"])
logger = logging.getLogger(__name__)


def _normalize_service(s: dict) -> dict:
    price_range = s.get("price", {}).get("range") if isinstance(s.get("price"), dict) else None
    price_str = str(price_range[0]) if price_range else None
    duration_sec = s.get("durationSeconds")
    return {
        "id": s.get("id"),
        "name": s.get("title", ""),
        "categoryName": s.get("category"),
        "price": price_str,
        "duration": duration_sec // 60 if duration_sec else None,
        "description": s.get("description"),
    }


def _normalize_resource(r: dict) -> dict:
    return {
        "id": r.get("id"),
        "name": r.get("title", r.get("name", "")),
        "description": r.get("description"),
    }


def _normalize_commodity(c: dict) -> dict:
    price = c.get("price")
    return {
        "id": c.get("id"),
        "name": c.get("title", ""),
        "categoryName": c.get("category"),
        "price": str(price) if price is not None else None,
        "article": c.get("article"),
    }


@router.get("/services")
async def list_services(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    try:
        svc = await OneDentaService.from_db(db)
        raw = await svc.get_services()
        return {"services": [_normalize_service(s) for s in raw]}
    except Exception:
        logger.exception("Failed to fetch services from 1Denta")
        return {"services": [], "error": "Не удалось загрузить данные из 1Denta"}


@router.get("/resources")
async def list_resources(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    try:
        svc = await OneDentaService.from_db(db)
        raw = await svc.get_resources()
        return {"resources": [_normalize_resource(r) for r in raw]}
    except Exception:
        logger.exception("Failed to fetch resources from 1Denta")
        return {"resources": [], "error": "Не удалось загрузить данные из 1Denta"}


@router.get("/commodities")
async def list_commodities(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    try:
        svc = await OneDentaService.from_db(db)
        raw = await svc.get_commodities()
        return {"commodities": [_normalize_commodity(c) for c in raw]}
    except Exception:
        logger.exception("Failed to fetch commodities from 1Denta")
        return {"commodities": [], "error": "Не удалось загрузить данные из 1Denta"}
