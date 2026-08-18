"""Calls router — serves call history from the local Communications table."""

from __future__ import annotations

import json
import logging
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/calls", tags=["calls"])


def _json_compact(obj) -> str:
    """Читаемый JSON для показа диагностики в alert (с отступами, кириллица как есть)."""
    return json.dumps(obj, ensure_ascii=False, indent=2)


def _rostelecom_debug_summary(debug: dict) -> str:
    """Компактная сводка диагностики Ростелекома для показа в alert (скриншот)."""
    lines = [
        "Ростелеком вернул пустой журнал (0 звонков за период).",
        f"Период: {debug.get('date_from', '')[:19]} … {debug.get('date_to', '')[:19]} (UTC)",
        "",
    ]
    for att in debug.get("attempts", []):
        fmt = "epoch" if att.get("date_epoch") else "строка-даты"
        polls = att.get("polls") or []
        line = f"• Формат {fmt}: order_id={att.get('order_id', '') or '—'}, попыток={len(polls)}"
        if att.get("error"):
            line += f", ОШИБКА: {att['error']}"
        lines.append(line)
        last = polls[-1] if polls else None
        if last:
            lines.append(
                f"    ответ ВАТС: status={last.get('status')} "
                f"формат={last.get('kind')} байт={last.get('bytes')} строк={last.get('rows')}"
            )
            if last.get("head"):
                lines.append(f"    начало файла: {last['head'][:160]}")
    lines.append("")
    lines.append("Пришлите этот текст (скриншот) — по нему видно, что именно вернула ВАТС.")
    return "\n".join(lines)


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


def _map_rostelecom_stat(row: dict) -> dict | None:
    """Map a Rostelecom download_call_history CSV row to Communication values.

    Столбцы CSV (руководство v7.5, табл. А.3.14): session_id, call_type,
    direction (1 входящий/2 исходящий/3 внутренний), state (1 принят/2 не
    принят), orig_number, dest_number, start_call_date (unix), duration,
    is_record. Внутренние вызовы (direction=3) пропускаем.
    """
    from app.services.rostelecom import _first, _first_int, _digits_phone, _parse_call_datetime

    session_id = _first(row, "session_id", "call_id")
    if not session_id:
        return None

    dir_code = _first(row, "direction")
    if dir_code == "3":
        return None
    direction = "outbound" if dir_code == "2" else "inbound"

    caller_id = _digits_phone(_first(row, "orig_number"))
    called_did = _digits_phone(_first(row, "dest_number"))

    seconds = _first_int(row, "duration")
    answered = _first(row, "state") == "1" or seconds > 0
    comm_type = "call" if answered else "missed_call"

    created_at = _parse_call_datetime(_first(row, "start_call_date"))

    return {
        "external_id": str(session_id),
        "caller_id": caller_id,
        "called_did": called_did,
        "duration_sec": seconds,
        "comm_type": comm_type,
        "direction": direction,
        "created_at": created_at,
    }


async def _upsert_mapped_calls(db: AsyncSession, mapped_list: list[dict | None]) -> dict:
    """Идемпотентный импорт списка сопоставленных записей звонков в историю.

    Дедуп по external_id, канал = "novofon" (общий телефонный канал). Общий код
    для Novofon-синка и импорта журнала Ростелекома.
    """
    import json as _json

    all_ext_ids = [m["external_id"] for m in mapped_list if m and m.get("external_id")]
    existing_by_ext_id: dict[str, list[Communication]] = {}
    if all_ext_ids:
        existing_result = await db.execute(
            select(Communication).where(
                Communication.channel == "novofon",
                Communication.external_id.in_(all_ext_ids),
            )
        )
        for c in existing_result.scalars().all():
            existing_by_ext_id.setdefault(c.external_id, []).append(c)

    synced = updated = skipped = 0
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
            # Приводим все хранимые строки этой сессии к авторитетному результату
            # АТС (disposition/state), т.к. реалтайм-события могли угадать статус
            # по длительности.
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
    return {"synced": synced, "updated": updated, "skipped": skipped}


async def import_rostelecom_history(db: AsyncSession, rows: list[dict]) -> dict:
    """Импорт скачанного CSV-журнала Ростелекома (вызывается из вебхука
    history_file_completed)."""
    mapped = [_map_rostelecom_stat(r) for r in rows]
    result = await _upsert_mapped_calls(db, mapped)
    result["total_from_file"] = len(rows)
    return result


@router.get("/sync/inspect")
async def inspect_novofon_stats(
    days: int = Query(7, ge=1, le=30),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return raw telephony-provider statistics for debugging field names."""
    provider = await get_telephony_provider(db)
    if provider == "rostelecom":
        return {
            "provider": "rostelecom",
            "note": (
                "История домена Ростелеком выгружается асинхронно "
                "(domain_call_history → вебхук history_file_completed → "
                "download_call_history). Импорт происходит после готовности файла."
            ),
        }
    if not await get_raw_value(db, "novofon_api_key"):
        return {"error": "Novofon API key not configured"}

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
    """Импорт истории звонков активного провайдера телефонии.

    Novofon — синхронно (statistics API). Ростелеком — асинхронно: запрашиваем
    формирование файла журнала (domain_call_history); готовый файл приходит
    вебхуком history_file_completed и импортируется автоматически.
    """
    from fastapi import HTTPException as _HTTPException

    provider = await get_telephony_provider(db)
    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    if provider == "rostelecom":
        if not await get_raw_value(db, "rostelecom_client_id"):
            return {"synced": 0, "skipped": 0, "message": "Rostelecom client id not configured"}
        svc = await get_telephony_service(db)
        date_to = datetime.now(timezone.utc)

        # Пытаемся скачать и импортировать журнал сразу, не дожидаясь обратного
        # вебхука history_file_completed (он может быть не настроен/задержаться).
        # Формат дат в domain_call_history в руководстве описан противоречиво
        # («Timestamp», но пример — строка), поэтому пробуем оба: строку по
        # Москве и unix-timestamp. Берём тот запрос, что вернул непустой журнал.
        rows: list[dict] | None = None
        last_order_id = ""
        last_error: Exception | None = None
        debug: dict = {
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "attempts": [],
        }
        # Строковый формат дат — из примера руководства, даём ему больше попыток
        # (файл может дозаполняться пару секунд); epoch — запасной вариант.
        for date_as_epoch, attempts in ((False, 8), (True, 5)):
            trace: list = []
            attempt_info: dict = {"date_epoch": date_as_epoch}
            try:
                order_id = await svc.request_call_history(
                    date_from, date_to, date_as_epoch=date_as_epoch
                )
                last_order_id = order_id or last_order_id
                attempt_info["order_id"] = order_id
                fetched = await svc.fetch_call_history(order_id, attempts=attempts, trace=trace)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                attempt_info["error"] = str(exc)[:300]
                debug["attempts"].append(attempt_info)
                logger.warning("Rostelecom sync attempt (epoch=%s) failed: %s", date_as_epoch, exc)
                continue
            attempt_info["polls"] = trace
            debug["attempts"].append(attempt_info)
            if fetched:  # непустой журнал — этот формат дат подошёл
                rows = fetched
                break
            if rows is None:
                rows = fetched  # запомним «готов, но пусто» ([]), не затирая None

        # Оба формата упали с ошибкой и файл так и не получен — это ошибка API.
        if rows is None and last_error is not None:
            raise _HTTPException(status_code=502, detail=f"rostelecom API error: {last_error}")

        if rows:
            result = await import_rostelecom_history(db, rows)
            result["order_id"] = last_order_id
            result["message"] = (
                f"Синхронизировано из Ростелекома: {result.get('synced', 0)} новых, "
                f"{result.get('updated', 0)} обновлено (в журнале за период: "
                f"{result.get('total_from_file', 0)})."
            )
            return result

        # Ничего не импортировано (пустой журнал или файл не готов) — вернём
        # диагностику, чтобы было видно реальный ответ ВАТС без доступа к логам.
        result = await import_rostelecom_history(db, rows or [])
        result["order_id"] = last_order_id
        result["debug"] = debug
        result["message"] = _rostelecom_debug_summary(debug)
        return result

    if not await get_raw_value(db, "novofon_api_key"):
        return {"synced": 0, "skipped": 0, "message": "Novofon API key not configured"}

    svc = await get_telephony_service(db)
    try:
        stats = await svc.get_call_history(date_from=date_from)
    except Exception as exc:
        raise _HTTPException(status_code=502, detail=f"novofon API error: {exc}")

    if not stats:
        return {"synced": 0, "skipped": 0, "total_from_api": 0}

    mapped_list = [_map_stat_to_comm(s) for s in stats]
    result = await _upsert_mapped_calls(db, mapped_list)
    result["total_from_api"] = len(stats)
    return result


@router.get("/recording/{call_id}")
async def get_recording(
    call_id: str,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = await get_telephony_service(db)
    url = await svc.get_recording(call_id)
    return {"url": url}
