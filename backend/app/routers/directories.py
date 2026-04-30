"""Directories / reference data from 1Denta."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.one_denta import OneDentaService

router = APIRouter(prefix="/api/v1/directories", tags=["directories"])


@router.get("/services")
async def list_services(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    svc = await OneDentaService.from_db(db)
    services = await svc.get_services()
    return {"services": services}


@router.get("/resources")
async def list_resources(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    svc = await OneDentaService.from_db(db)
    resources = await svc.get_resources()
    return {"resources": resources}


@router.get("/commodities")
async def list_commodities(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    svc = await OneDentaService.from_db(db)
    commodities = await svc.get_commodities()
    return {"commodities": commodities}
