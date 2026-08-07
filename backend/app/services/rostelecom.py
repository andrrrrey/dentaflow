"""Rostelecom «Виртуальная АТС» (Cloud PBX) telephony service.

Зеркалит интерфейс :class:`app.services.novofon.NovofonService`, чтобы роутеры
работали с любым провайдером телефонии единообразно (см. фабрику
``get_telephony_service`` в ``integrations_service``).

Интеграционный API Ростелекома (``https://api.cloudpbx.rt.ru``), по официальному
руководству администратора домена v7.5:

    * транспорт — POST, ``Content-Type: application/json``, HTTPS; метод = путь,
      например ``POST {base}/call_back``;
    * подпись каждого запроса (в обе стороны), заголовки:
        ``X-Client-ID``   = «Уникальный код идентификации»;
        ``X-Client-Sign`` = sha256hex(<код идентификации> + <тело JSON> + <ключ подписи>).

Ключевые интерфейсы:
    * call_events (вебхук к нам)  — события вызова: new/calling/connected/
      disconnected/end/analytics; поля session_id/type/state/from_number/
      request_number/is_record. Длительность в событии НЕ передаётся —
      финальный статус/длительность берём из call_info на событии ``end``.
    * call_info (мы → API)        — детальная информация о вызове по session_id
      (direction 1/2/3, state 1 принят/2 не принят, duration, is_record).
    * get_record (мы → API)       — одноразовая ссылка на запись по session_id.
    * call_back (мы → API)        — исходящий вызов (request_number + from_sipuri).
    * domain_call_history/download_call_history — асинхронная выгрузка журнала
      (order_id → вебхук history_file_completed → скачивание gzip-CSV).
    * get_number_info (вебхук к нам) — карточка звонящего (displayName/PIN).
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import hmac
import io
import json as _json
import logging
import re
from datetime import datetime, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_API_URL = "https://api.cloudpbx.rt.ru"

# Единый внутренний идентификатор канала «телефония». Оставлен как "novofon"
# (drop-in): значение встречается по всему коду (история, дедуп, дашборд,
# автолиды, фронт-фильтры), провайдер определяет лишь источник событий/записей.
TELEPHONY_CHANNEL = "novofon"


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
    """SIP-URI/E.164 → нормализованный номер '+7...'. Внутренние URI → ''.

    'sip:79771234567@dom.ru' → '+79771234567'; '89035555555' → '+79035555555';
    'user@dom.ru' → '' (нет цифрового номера, внутренний адрес).
    """
    if not raw:
        return ""
    # Берём первую последовательность цифр (для SIP-URI это часть до '@').
    m = re.search(r"\+?\d[\d\-\s()]*", raw)
    if not m:
        return ""
    digits = re.sub(r"\D", "", m.group(0))
    if not digits:
        return ""
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    return "+" + digits


class RostelecomService:
    """Async-обёртка над интеграционным API Ростелеком ВАТС."""

    provider = "rostelecom"

    def __init__(
        self,
        signing_key: str | None = None,
        client_id: str | None = None,
        api_url: str | None = None,
        domain: str | None = None,
    ) -> None:
        self.signing_key = signing_key or settings.ROSTELECOM_SIGNING_KEY
        self.client_id = client_id or settings.ROSTELECOM_CLIENT_ID
        self.base_url = (api_url or settings.ROSTELECOM_API_URL or DEFAULT_API_URL).rstrip("/")
        self.domain = domain or ""

    # ------------------------------------------------------------------
    # Подпись
    # ------------------------------------------------------------------

    def sign(self, raw_body: str) -> str:
        """X-Client-Sign = sha256hex(client_id + json_body + signing_key)."""
        return hashlib.sha256(
            (self.client_id + raw_body + self.signing_key).encode("utf-8")
        ).hexdigest()

    def verify(self, raw_body: str, signature: str) -> bool:
        """Проверка подписи входящего вебхука тем же алгоритмом."""
        if not self.signing_key or not self.client_id:
            return True  # креды не настроены — не блокируем первичную настройку
        return hmac.compare_digest(self.sign(raw_body), (signature or "").strip())

    def _headers(self, raw_body: str) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "X-Client-ID": self.client_id,
            "X-Client-Sign": self.sign(raw_body),
        }

    async def _post(self, method: str, payload: dict, *, timeout: float = 15.0) -> httpx.Response:
        """POST подписанного JSON на ``{base_url}/{method}``.

        Тело сериализуется один раз и той же строкой подписывается — подпись
        должна считаться ровно по отправляемым байтам."""
        raw = _json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        async with httpx.AsyncClient(timeout=timeout) as client:
            return await client.post(
                f"{self.base_url}/{method.lstrip('/')}",
                headers=self._headers(raw),
                content=raw.encode("utf-8"),
            )

    # ------------------------------------------------------------------
    # Входящие события call_events → внутренний Communication-dict
    # ------------------------------------------------------------------

    async def handle_call_event(self, body: dict) -> dict | None:
        """Строит dict для сохранения Communication из события call_events.

        Реагируем на два состояния:
          * ``new`` — создаём «живую» запись о звонке (для реалтайма/лида);
          * ``end`` — финализируем звонок авторитетными данными call_info
            (принят/не принят, длительность, номера).
        Остальные состояния (calling/connected/disconnected/analytics) и
        внутренние вызовы (type=internal) пропускаем (возвращаем ``None``).
        """
        # Уже нормализованное событие (на всякий случай)
        if body.get("channel") == TELEPHONY_CHANNEL and "type" in body and "state" not in body:
            return body

        state = _first(body, "state").strip().lower()
        call_type = _first(body, "type").strip().lower()
        session_id = _first(body, "session_id", "call_session_id", "call_id")
        if not session_id:
            return None
        if call_type == "internal":
            return None  # внутренние вызовы не относятся к CRM

        direction = "outbound" if call_type in ("outbound", "outgoing", "out") else "inbound"
        from_number = _digits_phone(_first(body, "from_number", "from"))
        request_number = _digits_phone(_first(body, "request_number", "to"))

        if state == "new":
            caller_id = from_number if direction == "inbound" else request_number
            called_did = request_number if direction == "inbound" else from_number
            phone = caller_id if direction == "inbound" else called_did
            return self._result(
                direction=direction, comm_type="call", duration=0,
                caller_id=caller_id, called_did=called_did, phone=phone,
                external_id=session_id, created_at=self._parse_ts(_first(body, "timestamp")),
                create_callback_task=False,
            )

        if state != "end":
            return None  # calling / connected / disconnected / analytics

        # --- Финализация: авторитетные данные из call_info ---
        info = await self.call_info(session_id)
        if info:
            dir_code = str(info.get("direction") or "")
            direction = {"1": "inbound", "2": "outbound", "3": "inbound"}.get(dir_code, direction)
            answered = str(info.get("state") or "") == "1"
            duration = _first_int(info, "duration")
            # orig = вызывающий, dest = вызываемый (независимо от направления).
            caller_id = _digits_phone(_first(info, "orig_number"))
            called_did = _digits_phone(_first(info, "dest_number"))
            created_at = self._parse_epoch(_first(info, "start_call_date"))
        else:
            # Фоллбэк: call_info недоступен → судим по is_record события end.
            answered = _first(body, "is_record").lower() == "true"
            duration = 0
            caller_id = from_number if direction == "inbound" else request_number
            called_did = request_number if direction == "inbound" else from_number
            created_at = self._parse_ts(_first(body, "timestamp"))

        comm_type = "call" if (answered or duration > 0) else "missed_call"
        phone = caller_id if direction == "inbound" else called_did
        return self._result(
            direction=direction, comm_type=comm_type, duration=duration,
            caller_id=caller_id, called_did=called_did, phone=phone,
            external_id=session_id, created_at=created_at,
            create_callback_task=(comm_type == "missed_call" and direction == "inbound"),
        )

    @staticmethod
    def _result(**kw) -> dict:
        content = _json.dumps(
            {"caller_id": kw["caller_id"], "called_did": kw["called_did"]}, ensure_ascii=False
        )
        return {
            "channel": TELEPHONY_CHANNEL,
            "direction": kw["direction"],
            "type": kw["comm_type"],
            "content": content,
            "duration_sec": kw["duration"],
            "status": "new",
            "priority": "high" if kw["comm_type"] == "missed_call" else "normal",
            "external_id": kw["external_id"],
            "phone": kw["phone"],
            "create_callback_task": kw["create_callback_task"],
            "created_at": kw.get("created_at"),
        }

    @staticmethod
    def _parse_ts(ts: str) -> datetime | None:
        """'2018-04-23 15:01:27.214' (Москва, UTC+3) → aware datetime."""
        if not ts:
            return None
        from zoneinfo import ZoneInfo
        moscow = ZoneInfo("Europe/Moscow")
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(ts.strip()[:26], fmt).replace(tzinfo=moscow)
            except ValueError:
                continue
        return None

    @staticmethod
    def _parse_epoch(ts: str) -> datetime | None:
        if not ts:
            return None
        try:
            return datetime.fromtimestamp(int(float(ts)), tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            return None

    # ------------------------------------------------------------------
    # Запросы к API
    # ------------------------------------------------------------------

    async def call_info(self, session_id: str) -> dict:
        """Детальная информация о вызове (метод ``call_info``). ``info`` или {}."""
        if not self.signing_key or not self.client_id:
            return {}
        try:
            resp = await self._post("call_info", {"session_id": session_id})
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.debug("call_info error (session=%s): %s", session_id, exc)
            return {}
        if str(data.get("result")) == "0" and isinstance(data.get("info"), dict):
            return data["info"]
        return {}

    async def make_call(self, from_num: str, to_num: str) -> dict:
        """Исходящий вызов (метод ``call_back``).

        ``from_num`` — SIP-URI пользователя домена (например
        ``sip:user@domain``), ``to_num`` — номер вызываемого в E.164.
        """
        payload = {"request_number": to_num, "from_sipuri": from_num}
        resp = await self._post("call_back", payload)
        try:
            return resp.json()
        except Exception:
            return {"result": str(resp.status_code)}

    async def get_recording(self, session_id: str) -> str:
        """Одноразовая ссылка на запись разговора (метод ``get_record``).

        Ссылка привязана к IP, с которого пришёл запрос (наш сервер), поэтому
        скачивать её нужно сразу и с того же хоста.
        """
        if not self.signing_key or not self.client_id:
            return ""
        try:
            resp = await self._post("get_record", {"session_id": session_id})
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.debug("get_record error (session=%s): %s", session_id, exc)
            return ""
        if str(data.get("result")) == "0":
            return str(data.get("url") or "").strip()
        logger.info("get_record (session=%s) result=%s msg=%s",
                    session_id, data.get("result"), data.get("resultMessage"))
        return ""

    async def download_recording_bytes(self, url: str) -> bytes | None:
        """Скачать байты записи по одноразовой ссылке get_record."""
        if not url:
            return None
        try:
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                resp = await client.get(url)
                if resp.status_code == 200 and len(resp.content) > 1000:
                    return resp.content
                logger.warning("Rostelecom recording download: status=%s len=%d",
                               resp.status_code, len(resp.content))
        except Exception as exc:  # noqa: BLE001
            logger.error("Rostelecom recording download failed: %s", exc)
        return None

    # ------------------------------------------------------------------
    # История домена (асинхронная выгрузка журнала)
    # ------------------------------------------------------------------

    async def request_call_history(
        self,
        date_from: datetime | None,
        date_to: datetime | None,
        direction: int = 0,
        state: int = 0,
    ) -> str:
        """Запрос на формирование файла журнала (метод ``domain_call_history``).

        Возвращает ``order_id`` — файл придёт асинхронно вебхуком
        ``history_file_completed`` и скачивается через ``download_call_history``.
        """
        def _fmt(dt: datetime | None) -> str:
            if not dt:
                return ""
            from zoneinfo import ZoneInfo
            return dt.astimezone(ZoneInfo("Europe/Moscow")).strftime("%Y-%m-%d %H:%M:%S")

        payload = {
            "date_start": _fmt(date_from),
            "date_end": _fmt(date_to),
            "direction": direction,
            "state": state,
        }
        resp = await self._post("domain_call_history", payload)
        data = resp.json()
        if str(data.get("result")) == "0":
            return str(data.get("order_id") or "")
        raise RuntimeError(f"domain_call_history: {data.get('resultMessage') or data}")

    async def download_call_history(self, order_id: str) -> list[dict]:
        """Скачать и распарсить gzip-CSV журнала вызовов (``download_call_history``)."""
        resp = await self._post("download_call_history", {"order_id": order_id}, timeout=90.0)
        raw = resp.content
        try:
            text = gzip.decompress(raw).decode("utf-8", errors="replace")
        except (OSError, EOFError):
            text = raw.decode("utf-8", errors="replace")
        if not text.strip():
            return []
        sample = text[:2048]
        delimiter = ";" if sample.count(";") >= sample.count(",") else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        return [dict(row) for row in reader]

    # Единый контракт с NovofonService: синхронная история недоступна
    # (журнал домена выгружается асинхронно), возвращаем пустой список.
    async def get_call_history(self, date_from=None, date_to=None) -> list[dict]:  # noqa: ARG002
        return []
