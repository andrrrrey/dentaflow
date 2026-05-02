"""Directories — reference data cached from 1Denta.

GET /services, /resources, /commodities  → return cached rows from DB
POST /sync                                → fetch from 1Denta, upsert to DB, return counts
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.directory_cache import DirectoryCache
from app.models.user import User
from app.services.one_denta import OneDentaService

router = APIRouter(prefix="/api/v1/directories", tags=["directories"])
logger = logging.getLogger(__name__)


# ── Normalizers ────────────────────────────────────────────────────────────────

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


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_cached(db: AsyncSession, category: str) -> tuple[list[dict], str | None]:
    """Return (items, synced_at_iso) from DB cache."""
    result = await db.execute(
        select(DirectoryCache)
        .where(DirectoryCache.category == category)
        .order_by(DirectoryCache.name)
    )
    rows = result.scalars().all()
    synced_at = rows[0].synced_at.isoformat() if rows else None
    return [r.data for r in rows if r.data], synced_at


async def _upsert_items(db: AsyncSession, category: str, items: list[dict]) -> int:
    """Delete old rows and insert fresh ones. Returns count."""
    await db.execute(delete(DirectoryCache).where(DirectoryCache.category == category))
    now = datetime.now(timezone.utc)
    for item in items:
        ext_id = str(item.get("id", "")) or None
        name = item.get("name") or item.get("title") or ""
        db.add(DirectoryCache(
            category=category,
            external_id=ext_id,
            name=name,
            data=item,
            synced_at=now,
        ))
    await db.flush()
    return len(items)


# ── Read endpoints ─────────────────────────────────────────────────────────────

@router.get("/services")
async def list_services(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    items, synced_at = await _get_cached(db, "service")
    return {"services": items, "synced_at": synced_at}


@router.get("/resources")
async def list_resources(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    items, synced_at = await _get_cached(db, "resource")
    return {"resources": items, "synced_at": synced_at}


@router.get("/commodities")
async def list_commodities(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    items, synced_at = await _get_cached(db, "commodity")
    return {"commodities": items, "synced_at": synced_at}


# ── Sync endpoint ──────────────────────────────────────────────────────────────

@router.post("/sync")
async def sync_from_1denta(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Fetch all reference data from 1Denta and cache it in the DB."""
    errors: list[str] = {}
    counts: dict[str, int] = {}

    try:
        svc = await OneDentaService.from_db(db)
    except Exception as e:
        return {"ok": False, "error": f"Не удалось подключиться к 1Denta: {e}"}

    # Services
    try:
        raw = await svc.get_services()
        normalized = [_normalize_service(s) for s in raw]
        counts["services"] = await _upsert_items(db, "service", normalized)
    except Exception as e:
        logger.exception("Failed to sync services")
        errors["services"] = str(e)

    # Resources (doctors)
    try:
        raw = await svc.get_resources()
        normalized = [_normalize_resource(r) for r in raw]
        counts["resources"] = await _upsert_items(db, "resource", normalized)
        # Backfill doctor_name in appointments from cached resources
        await _backfill_doctor_names(db, normalized)
    except Exception as e:
        logger.exception("Failed to sync resources")
        errors["resources"] = str(e)

    # Commodities
    try:
        raw = await svc.get_commodities()
        normalized = [_normalize_commodity(c) for c in raw]
        counts["commodities"] = await _upsert_items(db, "commodity", normalized)
    except Exception as e:
        logger.exception("Failed to sync commodities")
        errors["commodities"] = str(e)

    await db.commit()

    return {
        "ok": len(errors) == 0,
        "counts": counts,
        "errors": errors,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }


async def _backfill_doctor_names(db: AsyncSession, resources: list[dict]) -> None:
    """Update appointments that have doctor_id but empty doctor_name."""
    from sqlalchemy import update
    from app.models.appointment import Appointment

    name_by_id: dict[str, str] = {
        str(r["id"]): r["name"]
        for r in resources
        if r.get("id") and r.get("name")
    }
    if not name_by_id:
        return

    for doctor_id, doctor_name in name_by_id.items():
        await db.execute(
            update(Appointment)
            .where(
                Appointment.doctor_id == doctor_id,
                (Appointment.doctor_name == None) | (Appointment.doctor_name == ""),
            )
            .values(doctor_name=doctor_name)
        )
