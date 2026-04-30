"""Directories / reference data from 1Denta."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.user import User
from app.services.one_denta import OneDentaService

router = APIRouter(prefix="/api/v1/directories", tags=["directories"])


@router.get("/services")
async def list_services(
    _current_user: User = Depends(get_current_user),
) -> dict:
    svc = OneDentaService()
    services = await svc.get_services()
    return {"services": services}


@router.get("/resources")
async def list_resources(
    _current_user: User = Depends(get_current_user),
) -> dict:
    svc = OneDentaService()
    resources = await svc.get_resources()
    return {"resources": resources}


@router.get("/commodities")
async def list_commodities(
    _current_user: User = Depends(get_current_user),
) -> dict:
    svc = OneDentaService()
    commodities = await svc.get_commodities()
    return {"commodities": commodities}
