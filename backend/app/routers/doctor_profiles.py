"""Профили врачей для раздела «Сотрудники».

Показывает врачей из справочника 1Denta (directory_cache / resource), скрывая
безымянные плейсхолдеры («Врач #N»), и позволяет задать локальные поля —
дату рождения и график работы. Переименование врача выполняется отдельно через
PATCH /directories/resources/{external_id} (правит имя в directory_cache).
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, role_required
from app.models.doctor_profile import DoctorProfile
from app.models.user import User
from app.routers.directories import get_resource_items

router = APIRouter(prefix="/api/v1/doctor-profiles", tags=["doctor-profiles"])

# «Врач #3», «Врач № 12», «Врач 5» — безымянный плейсхолдер без реального имени.
_PLACEHOLDER_RE = re.compile(r"^\s*врач\s*[#№]?\s*\d+\s*$", re.IGNORECASE)


def _is_placeholder(item: dict) -> bool:
    if item.get("_placeholder"):
        return True
    name = str(item.get("name") or "").strip()
    if not name:
        return True
    return bool(_PLACEHOLDER_RE.match(name))


class DoctorProfileUpdate(BaseModel):
    birth_date: str | None = None  # 'YYYY-MM-DD' | null
    weekly_hours: dict | None = None
    schedule_exceptions: list | None = None


def _serialize(item: dict, profile: DoctorProfile | None) -> dict:
    return {
        "doctor_id": str(item.get("id", "")),
        "name": item.get("name") or "",
        "description": item.get("description"),
        "birth_date": profile.birth_date.isoformat() if profile and profile.birth_date else None,
        "weekly_hours": (profile.weekly_hours if profile else None) or {},
        "schedule_exceptions": (profile.schedule_exceptions if profile else None) or [],
    }


@router.get("/")
async def list_doctor_profiles(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    items, synced_at = await get_resource_items(db)
    doctors = [it for it in items if not _is_placeholder(it)]

    profiles = (await db.execute(select(DoctorProfile))).scalars().all()
    by_id = {p.doctor_id: p for p in profiles}

    return {
        "doctors": [_serialize(it, by_id.get(str(it.get("id", "")))) for it in doctors],
        "synced_at": synced_at,
    }


@router.put("/{doctor_id}")
async def upsert_doctor_profile(
    doctor_id: str,
    body: DoctorProfileUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(role_required("owner", "manager")),
) -> dict:
    from datetime import date

    profile = (await db.execute(
        select(DoctorProfile).where(DoctorProfile.doctor_id == doctor_id)
    )).scalar_one_or_none()
    if profile is None:
        profile = DoctorProfile(doctor_id=doctor_id)
        db.add(profile)

    profile.birth_date = date.fromisoformat(body.birth_date) if body.birth_date else None
    profile.weekly_hours = body.weekly_hours or {}
    profile.schedule_exceptions = body.schedule_exceptions or []

    await db.commit()
    await db.refresh(profile)
    return {
        "doctor_id": profile.doctor_id,
        "birth_date": profile.birth_date.isoformat() if profile.birth_date else None,
        "weekly_hours": profile.weekly_hours or {},
        "schedule_exceptions": profile.schedule_exceptions or [],
    }
