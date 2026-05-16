"""Calls router — serves call history from the local Communications table."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.communication import Communication
from app.models.user import User
from app.services.integrations_service import get_raw_value
from app.services.novofon import NovofonService

router = APIRouter(prefix="/api/v1/calls", tags=["calls"])


def _parse_call_record(comm: Communication) -> dict:
    caller_id = ""
    called_did = ""
    try:
        if comm.content:
            meta = json.loads(comm.content)
            caller_id = meta.get("caller_id", "")
            called_did = meta.get("called_did", "")
    except Exception:
        pass

    return {
        "call_id": comm.external_id or str(comm.id),
        "caller_id": caller_id,
        "called_did": called_did,
        "direction": comm.direction,
        "duration": comm.duration_sec or 0,
        "status": "missed" if comm.type == "missed_call" else "answered",
        "started_at": comm.created_at.isoformat() if comm.created_at else "",
    }


@router.get("/")
async def list_calls(
    days: int = Query(7, ge=1, le=90),
    status: str | None = Query(None, description="Filter: answered|missed"),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    stmt = (
        select(Communication)
        .where(
            Communication.channel == "novofon",
            Communication.type.in_(["call", "missed_call"]),
            Communication.created_at >= date_from,
        )
        .order_by(Communication.created_at.desc())
    )
    result = await db.execute(stmt)
    comms = result.scalars().all()

    calls = [_parse_call_record(c) for c in comms]

    if status == "missed":
        calls = [c for c in calls if c["status"] == "missed"]
    elif status == "answered":
        calls = [c for c in calls if c["status"] == "answered"]

    total = len(calls)
    missed = sum(1 for c in calls if c["status"] == "missed")
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
    db: AsyncSession = Depends(get_db),
) -> dict:
    api_key = await get_raw_value(db, "novofon_api_key")
    api_secret = await get_raw_value(db, "novofon_webhook_secret")
    svc = NovofonService(api_key=api_key or None, api_secret=api_secret or None)
    url = await svc.get_recording(call_id)
    return {"url": url}
