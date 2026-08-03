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
from app.services.integrations_service import (
    get_raw_value,
    get_telephony_provider,
    get_telephony_service,
)

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
        # internal grouping key — present when the call has a Novofon session id
        "_ext_id": comm.external_id or "",
    }


def _dedup_calls(records: list[dict]) -> list[dict]:
    """Collapse multiple Communication rows that belong to the same Novofon call
    session into one entry, so the history matches the Novofon report (which shows
    a single row per call session id).

    Novofon fires several webhook notifications per call (incoming / completed /
    missed) that all share the same ``call_session_id``. Each used to be stored as
    a separate Communication, producing 2-3 duplicate rows for a single call.

    Records keep their input order (newest first). When several share an external
    session id they are merged: the call counts as *answered* only if some leg was
    actually picked up (an answered leg with talk time > 0); the longest duration
    and first non-empty phone numbers win.
    """
    merged: dict[str, dict] = {}
    ordered_keys: list[str] = []

    for rec in records:
        ext_id = rec.get("_ext_id") or ""
        # No session id → cannot safely dedup, keep as its own row.
        key = ext_id if ext_id else f"__row_{rec['call_id']}"

        if key not in merged:
            merged[key] = dict(rec)
            ordered_keys.append(key)
            continue

        cur = merged[key]
        rec_answered = rec["status"] == "answered" and rec["duration"] > 0
        cur_answered = cur["status"] == "answered" and cur["duration"] > 0
        if rec_answered and not cur_answered:
            cur["status"] = "answered"
        cur["duration"] = max(cur["duration"], rec["duration"])
        if not cur.get("caller_id") and rec.get("caller_id"):
            cur["caller_id"] = rec["caller_id"]
        if not cur.get("called_did") and rec.get("called_did"):
            cur["called_did"] = rec["called_did"]
        # keep the earliest start time (the call actually began then)
        if rec.get("started_at") and (not cur.get("started_at") or rec["started_at"] < cur["started_at"]):
            cur["started_at"] = rec["started_at"]

    result = [merged[k] for k in ordered_keys]
    for r in result:
        r.pop("_ext_id", None)
    return result


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

    calls = _dedup_calls([_parse_call_record(c) for c in comms])

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


def _extract_phone(clid: str) -> str:
    """Extract plain phone number from Novofon clid field.

    clid arrives as '"79270120777" <79270120777>' or just '79270120777'.
    """
    import re
    m = re.search(r"<(\d+)>", clid)
    digits = m.group(1) if m else re.sub(r"\D", "", clid)
    return ("+" + digits) if digits else ""


def _map_stat_to_comm(stat: dict) -> dict | None:
    """Map a Novofon statistics record to Communication field values."""
    call_id = str(stat.get("call_id") or stat.get("pbx_call_id") or "").strip()
    if not call_id:
        return None

    caller_id = _extract_phone(str(stat.get("clid") or ""))
    called_did = str(stat.get("destination") or "").strip()

    seconds = int(stat.get("seconds") or 0)
    disposition = str(stat.get("disposition") or "").lower()
    comm_type = "call" if disposition == "answered" else "missed_call"

    direction_raw = str(stat.get("direction") or "in").lower()
    direction = "inbound" if direction_raw == "in" else "outbound"

    callstart_str = str(stat.get("callstart") or "").strip()
    created_at = None
    if callstart_str:
        try:
            from zoneinfo import ZoneInfo
            moscow = ZoneInfo("Europe/Moscow")
            created_at = datetime.strptime(callstart_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=moscow)
        except Exception:
            pass

    return {
        "external_id": call_id,
        "caller_id": caller_id,
        "called_did": called_did,
        "duration_sec": seconds,
        "comm_type": comm_type,
        "direction": direction,
        "created_at": created_at,
    }


def _map_rostelecom_stat(stat: dict) -> dict | None:
    """Map a Rostelecom domain_call_history record to Communication field values.

    Имена полей подтверждаются на боевом API (см. /sync/inspect), поэтому берём
    defensive-набор синонимов.
    """
    from app.services.rostelecom import _first, _first_int, _digits_phone

    call_id = _first(stat, "call_id", "callid", "call_session_id", "uuid", "id", "session_id")
    if not call_id:
        return None

    direction_raw = _first(stat, "direction", "type", "call_type", "way").lower()
    direction = "outbound" if direction_raw in ("out", "outgoing", "outbound", "0") else "inbound"

    contact = _digits_phone(_first(stat, "phone", "phone_number", "client_number", "caller_id",
                                   "contact_phone_number", "src", "abonent", "from"))
    virtual = _digits_phone(_first(stat, "diversion", "line_number", "virtual_phone_number",
                                   "called", "dst", "did", "to"))
    caller_id = contact if direction == "inbound" else virtual
    called_did = virtual if direction == "inbound" else contact

    seconds = _first_int(stat, "talk_time", "talk_duration", "billsec", "duration")
    status = _first(stat, "status", "disposition", "result", "type").lower()
    answered = seconds > 0 or any(m in status for m in ("answered", "success", "completed", "accept", "talk"))
    comm_type = "call" if answered else "missed_call"

    created_at = None
    start_str = _first(stat, "start", "callstart", "date", "start_time", "call_date", "created_at")
    if start_str:
        from zoneinfo import ZoneInfo
        moscow = ZoneInfo("Europe/Moscow")
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%d.%m.%Y %H:%M:%S"):
            try:
                created_at = datetime.strptime(start_str[:19], fmt).replace(tzinfo=moscow)
                break
            except ValueError:
                continue

    return {
        "external_id": str(call_id),
        "caller_id": caller_id,
        "called_did": called_did,
        "duration_sec": seconds,
        "comm_type": comm_type,
        "direction": direction,
        "created_at": created_at,
    }


@router.get("/sync/inspect")
async def inspect_novofon_stats(
    days: int = Query(7, ge=1, le=30),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return raw telephony-provider statistics for debugging field names."""
    provider = await get_telephony_provider(db)
    if provider == "novofon" and not await get_raw_value(db, "novofon_api_key"):
        return {"error": "Novofon API key not configured"}
    if provider == "rostelecom" and not await get_raw_value(db, "rostelecom_client_id"):
        return {"error": "Rostelecom client id not configured"}

    svc = await get_telephony_service(db)
    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    from fastapi import HTTPException as _HTTPException
    try:
        stats = await svc.get_call_history(date_from=date_from)
    except Exception as exc:
        raise _HTTPException(status_code=502, detail=f"{provider} API error: {exc}")

    return {
        "provider": provider,
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
    """Fetch call history from the active telephony provider and import missing records."""
    provider = await get_telephony_provider(db)
    if provider == "novofon" and not await get_raw_value(db, "novofon_api_key"):
        return {"synced": 0, "skipped": 0, "message": "Novofon API key not configured"}
    if provider == "rostelecom" and not await get_raw_value(db, "rostelecom_client_id"):
        return {"synced": 0, "skipped": 0, "message": "Rostelecom client id not configured"}

    svc = await get_telephony_service(db)
    stat_mapper = _map_rostelecom_stat if provider == "rostelecom" else _map_stat_to_comm
    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    from fastapi import HTTPException as _HTTPException
    try:
        stats = await svc.get_call_history(date_from=date_from)
    except Exception as exc:
        raise _HTTPException(status_code=502, detail=f"{provider} API error: {exc}")

    if not stats:
        return {"synced": 0, "skipped": 0, "total_from_api": 0}

    # Map once, then fetch existing records for these external_ids in one query
    mapped_list = [stat_mapper(s) for s in stats]
    all_ext_ids = [m["external_id"] for m in mapped_list if m and m.get("external_id")]
    existing_stmt = select(Communication).where(
        Communication.channel == "novofon",
        Communication.external_id.in_(all_ext_ids),
    )
    existing_result = await db.execute(existing_stmt)
    existing_by_ext_id: dict[str, list[Communication]] = {}
    for c in existing_result.scalars().all():
        existing_by_ext_id.setdefault(c.external_id, []).append(c)

    import json as _json

    synced = 0
    updated = 0
    skipped = 0
    for mapped in mapped_list:
        if not mapped:
            skipped += 1
            continue

        content = _json.dumps(
            {"caller_id": mapped["caller_id"], "called_did": mapped["called_did"]},
            ensure_ascii=False,
        )
        ext_id = mapped["external_id"]

        if ext_id in existing_by_ext_id:
            # Reconcile every stored row for this call session to Novofon's
            # authoritative result. Novofon derives the status from the call
            # `disposition` (АТС outcome), while realtime webhooks guessed it
            # from talk duration — so short "1 sec" calls were stored as
            # answered while Novofon reports them missed. Always overwrite so
            # the history matches the Novofon report.
            for comm in existing_by_ext_id[ext_id]:
                comm.content = content
                comm.type = mapped["comm_type"]
                comm.direction = mapped["direction"]
                comm.duration_sec = mapped["duration_sec"]
                comm.priority = "high" if mapped["comm_type"] == "missed_call" else "normal"
                if mapped["created_at"]:
                    comm.created_at = mapped["created_at"]
            updated += 1
            continue

        comm = Communication(
            channel="novofon",
            direction=mapped["direction"],
            type=mapped["comm_type"],
            content=content,
            duration_sec=mapped["duration_sec"],
            status="new",
            priority="high" if mapped["comm_type"] == "missed_call" else "normal",
            external_id=ext_id,
        )
        if mapped["created_at"]:
            comm.created_at = mapped["created_at"]
        db.add(comm)
        synced += 1

    if synced or updated:
        await db.commit()

    return {"synced": synced, "updated": updated, "skipped": skipped, "total_from_api": len(stats)}


@router.get("/recording/{call_id}")
async def get_recording(
    call_id: str,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = await get_telephony_service(db)
    url = await svc.get_recording(call_id)
    return {"url": url}
