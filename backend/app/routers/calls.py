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


def _map_stat_to_comm(stat: dict) -> dict | None:
    """Map a Novofon statistics record to Communication field values."""
    call_id = str(stat.get("call_id") or stat.get("pbx_call_id") or "").strip()
    if not call_id:
        return None

    caller_id = str(stat.get("from") or "").strip()
    called_did = str(stat.get("to") or "").strip()

    if caller_id and not caller_id.startswith("+"):
        caller_id = "+" + caller_id

    billsec = int(stat.get("billsec") or stat.get("duration") or 0)
    disposition = str(stat.get("disposition") or "").upper()
    comm_type = "call" if disposition == "ANSWERED" else "missed_call"

    calldate_str = str(stat.get("calldate") or "").strip()
    created_at = None
    if calldate_str:
        try:
            from zoneinfo import ZoneInfo
            moscow = ZoneInfo("Europe/Moscow")
            created_at = datetime.strptime(calldate_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=moscow)
        except Exception:
            created_at = datetime.now(timezone.utc)

    return {
        "external_id": call_id,
        "caller_id": caller_id,
        "called_did": called_did,
        "duration_sec": billsec,
        "comm_type": comm_type,
        "created_at": created_at,
    }


@router.get("/sync/inspect")
async def inspect_novofon_stats(
    days: int = Query(7, ge=1, le=30),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return raw Novofon statistics API response for debugging field names."""
    api_key = await get_raw_value(db, "novofon_api_key")
    api_secret = await get_raw_value(db, "novofon_webhook_secret")

    if not api_key:
        return {"error": "Novofon API key not configured"}

    svc = NovofonService(api_key=api_key, api_secret=api_secret or None)
    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    from fastapi import HTTPException as _HTTPException
    try:
        stats = await svc.get_call_history(date_from=date_from)
    except Exception as exc:
        raise _HTTPException(status_code=502, detail=f"Novofon API error: {exc}")

    return {
        "total": len(stats),
        "sample": stats[:3] if stats else [],
        "all_keys": list(stats[0].keys()) if stats else [],
    }


@router.post("/sync")
async def sync_calls(
    days: int = Query(7, ge=1, le=30),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch call history from Novofon API and import missing records."""
    api_key = await get_raw_value(db, "novofon_api_key")
    api_secret = await get_raw_value(db, "novofon_webhook_secret")

    if not api_key:
        return {"synced": 0, "skipped": 0, "message": "Novofon API key not configured"}

    svc = NovofonService(api_key=api_key, api_secret=api_secret or None)
    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    from fastapi import HTTPException as _HTTPException
    try:
        stats = await svc.get_call_history(date_from=date_from)
    except Exception as exc:
        raise _HTTPException(status_code=502, detail=f"Novofon API error: {exc}")

    if not stats:
        return {"synced": 0, "skipped": 0, "total_from_api": 0}

    # Fetch all existing external_ids in one query to avoid N+1
    all_ext_ids = [
        str(s.get("call_id") or s.get("pbx_call_id") or "")
        for s in stats if s.get("call_id") or s.get("pbx_call_id")
    ]
    existing_stmt = select(Communication.external_id).where(
        Communication.channel == "novofon",
        Communication.external_id.in_(all_ext_ids),
    )
    existing_result = await db.execute(existing_stmt)
    already_stored = {row[0] for row in existing_result.all()}

    synced = 0
    skipped = 0
    for stat in stats:
        mapped = _map_stat_to_comm(stat)
        if not mapped:
            skipped += 1
            continue
        if mapped["external_id"] in already_stored:
            skipped += 1
            continue

        import json as _json
        content = _json.dumps(
            {"caller_id": mapped["caller_id"], "called_did": mapped["called_did"]},
            ensure_ascii=False,
        )
        comm = Communication(
            channel="novofon",
            direction="inbound",
            type=mapped["comm_type"],
            content=content,
            duration_sec=mapped["duration_sec"],
            status="new",
            priority="high" if mapped["comm_type"] == "missed_call" else "normal",
            external_id=mapped["external_id"],
        )
        if mapped["created_at"]:
            comm.created_at = mapped["created_at"]
        db.add(comm)
        synced += 1

    if synced:
        await db.commit()

    return {"synced": synced, "skipped": skipped, "total_from_api": len(stats)}


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
