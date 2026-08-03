"""Rostelecom «Виртуальная АТС» (Cloud PBX) telephony service.

Зеркалит интерфейс :class:`app.services.novofon.NovofonService`, чтобы роутеры
работали с любым провайдером телефонии единообразно (см. фабрику
``get_telephony_service`` в ``integrations_service``).

Интеграционный API Ростелекома (``https://api.cloudpbx.rt.ru``):
    * транспорт — POST, ``application/json``, HTTPS;
    * подпись каждого запроса (в обе стороны):
        ``X-Client-ID``   = «Уникальный код идентификации»;
        ``X-Client-Sign`` = sha256hex(<Уникальный ключ для подписи> + <сырое тело>).

Точные имена полей в ответах (``call_events`` / ``get_record`` /
``domain_call_history``) на публичной документации подтвердить нельзя
(гео-блокировка), поэтому парсинг сделан defensive — перебираем известные
синонимы имён и сверяем на боевом API (см. ``debug_rostelecom.py`` и
``GET /api/v1/calls/sync/inspect``).
"""

from __future__ import annotations

import hashlib
import json as _json
import logging
import re
import uuid
from datetime import datetime, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_API_URL = "https://api.cloudpbx.rt.ru"

# Единый внутренний идентификатор канала «телефония». Оставлен как "novofon"
# (drop-in): значение встречается по всему коду (история, дедуп, дашборд,
# автолиды, фронт-фильтры), провайдер определяет лишь источник событий/записей.
TELEPHONY_CHANNEL = "novofon"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _first(d: dict, *keys: str) -> str:
    """Первое непустое строковое значение по списку возможных имён поля."""
    for k in keys:
        v = d.get(k)
        if v not in (None, ""):
            return str(v)
    return ""


def _first_int(d: dict, *keys: str) -> int:
    for k in keys:
        v = d.get(k)
        if v not in (None, ""):
            try:
                return int(float(v))
            except (TypeError, ValueError):
                continue
    return 0


def _digits_phone(raw: str) -> str:
    """'"7927..." <7927...>' | '+7 927 ...' → '+7927...'. Пусто → ''."""
    if not raw:
        return ""
    m = re.search(r"<(\+?\d+)>", raw)
    src = m.group(1) if m else raw
    digits = re.sub(r"\D", "", src)
    return ("+" + digits) if digits else ""


class RostelecomService:
    """Async-обёртка над интеграционным API Ростелеком ВАТС."""

    provider = "rostelecom"

    def __init__(
        self,
        signing_key: str | None = None,
        client_id: str | None = None,
        api_url: str | None = None,
    ) -> None:
        self.signing_key = signing_key or settings.ROSTELECOM_SIGNING_KEY
        self.client_id = client_id or settings.ROSTELECOM_CLIENT_ID
        self.base_url = (api_url or settings.ROSTELECOM_API_URL or DEFAULT_API_URL).rstrip("/")

    # ------------------------------------------------------------------
    # Подпись
    # ------------------------------------------------------------------

    def sign(self, raw_body: str) -> str:
        """X-Client-Sign = sha256hex(signing_key + raw_body)."""
        return hashlib.sha256((self.signing_key + raw_body).encode("utf-8")).hexdigest()

    def verify(self, raw_body: str, signature: str) -> bool:
        """Проверка подписи входящего вебхука тем же алгоритмом."""
        if not self.signing_key:
            return True  # ключ не настроен — не блокируем первичную настройку
        import hmac
        return hmac.compare_digest(self.sign(raw_body), (signature or "").strip())

    def _headers(self, raw_body: str) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "X-Client-ID": self.client_id,
            "X-Client-Sign": self.sign(raw_body),
        }

    async def _post(self, method: str, payload: dict, *, timeout: float = 15.0) -> httpx.Response:
        """POST подписанного JSON на ``{base_url}/{method}``.

        Тело сериализуется один раз и той же строкой подписывается (подпись
        должна считаться ровно по отправляемым байтам)."""
        raw = _json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        async with httpx.AsyncClient(timeout=timeout) as client:
            return await client.post(
                f"{self.base_url}/{method.lstrip('/')}",
                headers=self._headers(raw),
                content=raw.encode("utf-8"),
            )

    # ------------------------------------------------------------------
    # Входящие события (нормализация call_events → внутренний формат)
    # ------------------------------------------------------------------

    def parse_call_event(self, raw: dict) -> dict:
        """Нормализует сырое тело ``call_events`` в общий event-формат.

        Возвращает dict с ключами event/caller_id/called_did/call_id/duration/
        direction — тот же контракт, что даёт ``_parse_novofon_notification``.
        """
        # Уже нормализовано?
        if "caller_id" in raw and "event" in raw:
            return raw

        call = raw.get("call") if isinstance(raw.get("call"), dict) else raw

        direction_raw = _first(call, "direction", "type", "call_type", "way").lower()
        direction = "outbound" if direction_raw in ("out", "outgoing", "outbound", "0") else "inbound"

        contact_phone = _digits_phone(
            _first(call, "phone", "phone_number", "caller_id", "from", "client_number",
                   "contact_phone_number", "src", "abonent")
        )
        virtual_number = _digits_phone(
            _first(call, "diversion", "virtual_phone_number", "called", "to",
                   "line_number", "dst", "did")
        )
        caller_id = contact_phone if direction == "inbound" else virtual_number
        called_did = virtual_number if direction == "inbound" else contact_phone

        call_id = _first(call, "call_id", "callid", "call_session_id", "uuid",
                         "session_id", "id", "crm_token") or str(uuid.uuid4())

        duration = _first_int(call, "talk_time", "talk_duration", "talk_time_duration",
                              "billsec", "duration")

        status = _first(call, "type", "status", "disposition", "result", "event").lower()

        # Классификация исхода. Ростелеком шлёт несколько событий на звонок —
        # финальное состояние доводится дедупом по call_id в вебхуке.
        answered_markers = ("completed", "success", "answered", "accept", "talk", "history", "end")
        missed_markers = ("missed", "cancel", "not_answered", "noanswer", "no_answer",
                          "busy", "fail", "declin", "lost", "unavailable")
        start_markers = ("incoming", "ringing", "start", "new", "appeared", "dial", "setup")

        if duration > 0:
            event = "notify_end"
        elif any(m in status for m in missed_markers):
            event = "missed"
        elif any(m in status for m in answered_markers):
            event = "notify_end"
        elif any(m in status for m in start_markers):
            event = "notify_start"
        else:
            event = "missed"

        return {
            "event": event,
            "caller_id": caller_id,
            "called_did": called_did,
            "call_id": call_id,
            "duration": duration,
            "direction": direction,
        }

    async def handle_call_event(self, event: dict) -> dict:
        """Строит dict для сохранения Communication (общий с Novofon контракт).

        Принимает как сырое тело ``call_events``, так и уже нормализованный
        event — нормализация идемпотентна.
        """
        ev = self.parse_call_event(event)
        event_type = ev.get("event", "unknown")
        caller = ev.get("caller_id", "")
        callee = ev.get("called_did", "")
        call_id = str(ev.get("call_id") or str(uuid.uuid4()))
        duration = int(ev.get("duration") or 0)
        direction = "outbound" if ev.get("direction") == "outbound" else "inbound"

        if event_type in ("call_end", "notify_end"):
            comm_type, priority, create_callback_task = "call", "normal", False
        elif event_type in ("missed", "notify_out_start"):
            comm_type, priority, create_callback_task = "missed_call", "high", True
        elif event_type in ("call_start", "notify_start"):
            comm_type, priority, create_callback_task = "call", "normal", False
        else:
            comm_type, priority, create_callback_task = "missed_call", "high", True

        # Задачу-перезвон создаём только для входящих пропущенных.
        if direction == "outbound":
            create_callback_task = False

        phone = caller if direction == "inbound" else callee
        content = _json.dumps({"caller_id": caller, "called_did": callee}, ensure_ascii=False)

        logger.info(
            "Rostelecom event: type=%s call_id=%s phone=%s dur=%d dir=%s",
            event_type, call_id, phone, duration, direction,
        )

        return {
            "channel": TELEPHONY_CHANNEL,
            "direction": direction,
            "type": comm_type,
            "content": content,
            "duration_sec": duration,
            "status": "new",
            "priority": priority,
            "external_id": call_id,
            "phone": phone,
            "create_callback_task": create_callback_task,
        }

    # ------------------------------------------------------------------
    # Исходящие действия
    # ------------------------------------------------------------------

    async def make_call(self, from_num: str, to_num: str) -> dict:
        """Инициировать исходящий звонок (метод ``call_back``)."""
        payload = {"from": from_num, "to": to_num}
        resp = await self._post("call_back", payload)
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception:
            return {"status": resp.status_code}

    async def get_recording(self, call_id: str) -> str:
        """Вернуть ссылку на запись разговора (метод ``get_record``).

        Если API отдаёт JSON со ссылкой — вернём её. Если API отдаёт файл
        напрямую (или ссылки нет) — вернём сам ``call_id`` как маркер, а
        ``download_recording_bytes`` докачает байты повторным запросом.
        """
        if not self.signing_key or not self.client_id:
            return ""
        try:
            resp = await self._post("get_record", {"call_id": call_id})
        except Exception as exc:
            logger.debug("get_record error (call_id=%s): %s", call_id, exc)
            return ""

        ctype = resp.headers.get("content-type", "")
        if resp.status_code == 200 and "application/json" in ctype:
            try:
                data = resp.json()
            except Exception:
                data = {}
            link = _first(data, "link", "url", "record", "recording", "file_url", "download_url")
            if not link:
                nested = data.get("data") or data.get("result") or {}
                if isinstance(nested, dict):
                    link = _first(nested, "link", "url", "record", "recording", "file_url")
            if link:
                return link
        # Файл вернулся напрямую или ссылки нет — download_recording_bytes добьёт.
        if resp.status_code == 200 and resp.content and len(resp.content) > 1000:
            return f"rt-record:{call_id}"
        return ""

    async def download_recording_bytes(self, url_or_call_id: str) -> bytes | None:
        """Скачать байты записи по ссылке или по маркеру ``rt-record:<call_id>``."""
        if not url_or_call_id:
            return None

        # Маркер «файл отдаётся методом get_record» → повторный подписанный POST.
        if url_or_call_id.startswith("rt-record:"):
            call_id = url_or_call_id.split(":", 1)[1]
            try:
                resp = await self._post("get_record", {"call_id": call_id}, timeout=60.0)
                if resp.status_code == 200 and len(resp.content) > 1000:
                    return resp.content
                # Возможно, отдаётся через download_call_history
                resp = await self._post("download_call_history", {"call_id": call_id}, timeout=60.0)
                if resp.status_code == 200 and len(resp.content) > 1000:
                    return resp.content
            except Exception as exc:
                logger.error("Rostelecom record download failed (call_id=%s): %s", call_id, exc)
            return None

        # Обычная ссылка: пробуем с подписью и без.
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            for headers in ({"X-Client-ID": self.client_id, "X-Client-Sign": self.sign("")}, {}):
                try:
                    resp = await client.get(url_or_call_id, headers=headers)
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        return resp.content
                except Exception as exc:
                    logger.debug("Rostelecom recording GET failed: %s", exc)
        return None

    async def get_call_history(
        self,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[dict]:
        """История звонков домена (метод ``domain_call_history``)."""
        if not self.signing_key or not self.client_id:
            return []

        payload: dict[str, str] = {}
        if date_from:
            payload["date_from"] = date_from.strftime("%Y-%m-%d %H:%M:%S")
        if date_to:
            payload["date_to"] = date_to.strftime("%Y-%m-%d %H:%M:%S")

        try:
            resp = await self._post("domain_call_history", payload)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.error("domain_call_history error: %s", exc)
            raise

        if isinstance(data, list):
            return data
        for key in ("calls", "history", "records", "data", "result", "stats"):
            val = data.get(key)
            if isinstance(val, list):
                return val
        return []
