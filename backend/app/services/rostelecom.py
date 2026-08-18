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
import ssl
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


def _parse_call_datetime(value: str) -> datetime | None:
    """Дата/время вызова из журнала → aware datetime.

    ВАТС передаёт ``start_call_date`` то как unix-timestamp (столбец журнала
    описан как TIMESTAMP), то как строку по Москве (``yyyy-MM-dd HH:mm:ss[.S]``,
    как в ответах user_calls_charges). Поддерживаем оба формата.
    """
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    # Числовое значение → unix epoch (сек; поддержим и мс).
    if re.fullmatch(r"\d+(\.\d+)?", s):
        try:
            num = float(s)
        except ValueError:
            num = 0.0
        if num > 1e12:  # похоже на миллисекунды
            num /= 1000.0
        try:
            return datetime.fromtimestamp(num, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    # Иначе — строка даты по часовому поясу Москвы.
    from zoneinfo import ZoneInfo
    moscow = ZoneInfo("Europe/Moscow")
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s[:26], fmt).replace(tzinfo=moscow)
        except ValueError:
            continue
    return None


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
        server_cert: str | None = None,
        verify_ssl: bool = True,
    ) -> None:
        self.signing_key = signing_key or settings.ROSTELECOM_SIGNING_KEY
        self.client_id = client_id or settings.ROSTELECOM_CLIENT_ID
        self.base_url = (api_url or settings.ROSTELECOM_API_URL or DEFAULT_API_URL).rstrip("/")
        self.domain = domain or ""
        self.server_cert = (server_cert or "").strip()
        self.verify_ssl = verify_ssl
        self._verify = self._build_verify()

    def _build_verify(self):
        """Материал для проверки TLS сервера ВАТС.

        API Ростелекома отдаёт сертификат, выпущенный «Russian Trusted CA»
        (Минцифры), которого нет в стандартном хранилище (нужно «Скачать
        сертификат API» в ЛК — рук-во v7.5, §1.3.3). Вставленный сертификат
        добавляем к системным CA и включаем PARTIAL_CHAIN: тогда доверия к
        самому листу/промежуточному сертификату достаточно и OpenSSL не требует
        достраивать цепочку до самоподписанного российского корня (иначе —
        ошибка "self-signed certificate in certificate chain").
        """
        if not self.verify_ssl:
            return False
        if self.server_cert:
            try:
                ctx = ssl.create_default_context()
                ctx.load_verify_locations(cadata=self._normalize_pem(self.server_cert))
                # Доверять вставленному сертификату как якорю, не требуя
                # полной цепочки до доверенного корня.
                partial = getattr(ssl, "VERIFY_X509_PARTIAL_CHAIN", 0)
                if partial:
                    ctx.verify_flags |= partial
                return ctx
            except (ssl.SSLError, ValueError) as exc:
                logger.warning("Rostelecom: не удалось загрузить сертификат API: %s", exc)
        return True

    @staticmethod
    def _normalize_pem(text: str) -> str:
        """Привести вставленный PEM к валидному виду (CRLF→LF, финальный перенос)."""
        pem = text.replace("\r\n", "\n").replace("\r", "\n").strip()
        return pem + "\n" if pem else pem

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
        async with httpx.AsyncClient(timeout=timeout, verify=self._verify) as client:
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
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True, verify=self._verify) as client:
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
        *,
        date_as_epoch: bool = False,
    ) -> str:
        """Запрос на формирование файла журнала (метод ``domain_call_history``).

        Возвращает ``order_id`` — файл скачивается через ``download_call_history``
        (см. ``fetch_call_history``), либо приходит вебхуком
        ``history_file_completed``.

        Формат ``date_start``/``date_end`` в руководстве описан противоречиво:
        поле названо «Timestamp», но пример показывает строку ``yyyy-MM-dd
        HH:mm:ss``. Поэтому поддерживаем оба варианта: строку по Москве
        (``date_as_epoch=False``) и unix-timestamp (``date_as_epoch=True``) —
        синк перебирает оба, если первый вернул пустой журнал.
        """
        def _fmt(dt: datetime | None) -> str:
            if not dt:
                return ""
            if date_as_epoch:
                return str(int(dt.timestamp()))
            from zoneinfo import ZoneInfo
            return dt.astimezone(ZoneInfo("Europe/Moscow")).strftime("%Y-%m-%d %H:%M:%S")

        payload = {
            "date_start": _fmt(date_from),
            "date_end": _fmt(date_to),
            "direction": direction,
            "state": state,
        }
        logger.info("Rostelecom domain_call_history request (epoch=%s): %s", date_as_epoch, payload)
        resp = await self._post("domain_call_history", payload)
        data = resp.json()
        if str(data.get("result")) == "0":
            order_id = str(data.get("order_id") or "")
            logger.info("Rostelecom domain_call_history order_id=%s", order_id)
            return order_id
        raise RuntimeError(f"domain_call_history: {data.get('resultMessage') or data}")

    @staticmethod
    def _parse_history_csv(text: str) -> list[dict]:
        """Распарсить текст CSV-журнала в список строк-словарей."""
        if not text.strip():
            return []
        sample = text[:2048]
        delimiter = ";" if sample.count(";") >= sample.count(",") else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        return [dict(row) for row in reader]

    @staticmethod
    def _extract_history_text(raw: bytes) -> tuple[str, str | None]:
        """Достать CSV-текст из ответа download_call_history.

        Возвращает пару ``(kind, text)``: ``kind`` — распознанный формат тела
        (gzip/zip/csv/json-err/empty), ``text`` — распакованный CSV-текст либо
        ``None``, если тело не является журналом (JSON-ошибка/пустой/битый архив
        — сигнал «файл ещё не готов, повторить»).
        """
        if not raw:
            return "empty", None
        # gzip-архив с CSV (штатный ответ на готовый файл по руководству)
        if raw[:2] == b"\x1f\x8b":
            try:
                return "gzip", gzip.decompress(raw).decode("utf-8", errors="replace")
            except (OSError, EOFError):
                return "gzip-bad", None
        # ZIP-архив (ЛК ВАТС отдаёт выгрузки в ZIP; на всякий случай поддержим).
        if raw[:2] == b"PK":
            import zipfile

            try:
                with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                    names = [n for n in zf.namelist() if n.lower().endswith(".csv")] or zf.namelist()
                    parts = [zf.read(n).decode("utf-8", errors="replace") for n in names]
                    return "zip", "\n".join(parts)
            except (zipfile.BadZipFile, OSError):
                return "zip-bad", None
        text = raw.decode("utf-8", errors="replace")
        stripped = text.lstrip()
        # JSON (ошибка/файл ещё не готов) — не CSV, просим повторить попытку.
        if not stripped:
            return "empty", None
        if stripped[0] in "{[":
            return "json/err", None
        # HTML-заглушка «File … not found» — файл ещё НЕ сформирован на стороне
        # ВАТС (генерируется асинхронно). Это не пустой журнал, а «ещё не готово».
        low = stripped[:512].lower()
        if stripped[0] == "<" or "not found" in low or "<html" in low:
            return "not-ready", None
        # Некоторые серверы отдают plain-CSV без архивации — тоже валидный журнал.
        return "csv", text

    def _decode_history_response(self, resp: httpx.Response) -> list[dict] | None:
        """Разобрать ответ ``download_call_history``.

        Возвращает список строк журнала, когда файл готов (в т.ч. пустой список —
        готов, но вызовов нет), либо ``None``, когда файл ещё НЕ сформирован
        (сервер прислал JSON-ошибку/пустой ответ) — сигнал для повторной попытки.
        """
        _kind, text = self._extract_history_text(resp.content or b"")
        if text is None:
            return None
        return self._parse_history_csv(text)

    async def download_call_history(self, order_id: str) -> list[dict]:
        """Скачать и распарсить gzip-CSV журнала вызовов (``download_call_history``).

        Однократная попытка. Используется из вебхука ``history_file_completed``,
        когда файл гарантированно готов. ``[]`` — файл пуст или ещё не готов.
        """
        resp = await self._post("download_call_history", {"order_id": order_id}, timeout=90.0)
        rows = self._decode_history_response(resp)
        return rows or []

    def _diag_response(self, resp: httpx.Response, rows: list[dict] | None) -> dict:
        """Краткая диагностика ответа download_call_history для показа/логов.

        Для архивов показываем ГОЛОВУ распакованного CSV (заголовок + первая
        строка), чтобы было видно: файл только с шапкой (пусто) или с данными.
        """
        raw = resp.content or b""
        kind, text = self._extract_history_text(raw)
        head = (text if text is not None else raw.decode("utf-8", errors="replace"))[:200]
        return {
            "status": resp.status_code,
            "bytes": len(raw),
            "ctype": resp.headers.get("content-type", ""),
            "kind": kind,
            "rows": "not-ready" if rows is None else len(rows),
            "head": head.replace("\n", " ⏎ ").strip(),
        }

    async def fetch_call_history(
        self, order_id: str, *, attempts: int = 6, delay: float = 2.0,
        trace: list | None = None,
    ) -> list[dict] | None:
        """Дождаться готовности файла и скачать журнал (синхронная выгрузка).

        Опрашиваем ``download_call_history`` по уже полученному ``order_id`` с
        короткими паузами, не дожидаясь вебхука ``history_file_completed``. Так
        кнопка «Синхронизировать» импортирует историю сразу, не завися от
        обратного вебхука ВАТС.

        Важно: сразу после ``domain_call_history`` файл ещё формируется, и ВАТС
        может отдать по ``order_id`` ПУСТОЙ (или ещё не готовый) архив. Поэтому
        пустой результат тоже считаем «ещё не готово» и продолжаем опрос — иначе
        синк завершился бы нулём, хотя вызовы в журнале есть. Возвращаем:
          * непустой список — как только в файле появились строки;
          * ``[]`` — файл сформирован, но за отведённое время остался пустым;
          * ``None`` — файл так и не отдался (тогда импорт завершит вебхук).
        """
        import asyncio

        if not order_id:
            return None
        last_ready: list[dict] | None = None
        for i in range(max(1, attempts)):
            try:
                resp = await self._post(
                    "download_call_history", {"order_id": order_id}, timeout=60.0
                )
                rows = self._decode_history_response(resp)
                # Любой не-200 (напр. 404 «File … not found») = файл ещё не готов.
                if resp.status_code != 200:
                    rows = None
                diag = self._diag_response(resp, rows)
                logger.info(
                    "Rostelecom download_call_history poll #%d (order=%s): %s",
                    i + 1, order_id, diag,
                )
                if trace is not None:
                    trace.append({"poll": i + 1, **diag})
            except Exception as exc:  # noqa: BLE001
                logger.debug("download_call_history poll error (order=%s): %s", order_id, exc)
                if trace is not None:
                    trace.append({"poll": i + 1, "error": str(exc)[:200]})
                rows = None
            if rows:  # непустой журнал — готово
                return rows
            if rows == []:  # файл готов, но пока пустой — подождём, вдруг дозаполнится
                last_ready = []
            if i < attempts - 1:
                await asyncio.sleep(delay)
        return last_ready

    # Единый контракт с NovofonService: синхронная история недоступна
    # (журнал домена выгружается асинхронно), возвращаем пустой список.
    async def get_call_history(self, date_from=None, date_to=None) -> list[dict]:  # noqa: ARG002
        return []
