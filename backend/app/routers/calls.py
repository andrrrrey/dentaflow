"""Calls router — wraps Novofon call history."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user
from app.models.user import User
from app.services.novofon import NovofonService

router = APIRouter(prefix="/api/v1/calls", tags=["calls"])


@router.get("/")
async def list_calls(
    days: int = Query(7, ge=1, le=90, description="Number of past days to fetch"),
    status: str | None = Query(None, description="Filter: answered|missed"),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return call history from Novofon for the past N days."""
    svc = NovofonService()
    date_to = datetime.now(timezone.utc)
    date_from = date_to - timedelta(days=days)

    calls = await svc.get_call_history(date_from=date_from, date_to=date_to)

    if status:
        calls = [
            c for c in calls
            if (status == "missed" and (c.get("status") == "missed" or c.get("duration", 1) == 0))
            or (status == "answered" and c.get("status") != "missed" and c.get("duration", 0) > 0)
        ]

    total = len(calls)
    missed = sum(1 for c in calls if c.get("status") == "missed" or c.get("duration", 1) == 0)
    answered = total - missed

    return {
        "calls": calls,
        "stats": {
            "total": total,
            "answered": answered,
            "missed": missed,
            "answer_rate": round(answered / total * 100) if total else 0,
        },
    }


@router.get("/recording/{call_id}")
async def get_recording(
    call_id: str,
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return recording URL for a specific call."""
    svc = NovofonService()
    url = await svc.get_recording(call_id)
    return {"url": url}
