"""Тонкий async-клиент Asterisk Manager Interface (AMI).

Нужен только для одного действия — Originate исходящего звонка в контекст
``ai-outbound`` с проброшенной переменной ``CALL_ID`` (UUID сессии aicallrobot,
который Asterisk передаёт в AudioSocket). Полноценная обработка событий не нужна:
звонок и его исход живут в aicallrobot, AMI лишь инициирует вызов и сообщает,
принят ли Originate.
"""

from __future__ import annotations

import asyncio
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class AMIError(RuntimeError):
    pass


class AsteriskAMI:
    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
    ) -> None:
        self.host = host or settings.AMI_HOST
        self.port = port or settings.AMI_PORT
        self.username = username or settings.AMI_USERNAME
        self.password = password or settings.AMI_PASSWORD

    async def originate(
        self,
        *,
        phone: str,
        call_id: str,
        caller_id: str | None = None,
        context: str = "ai-outbound",
        trunk: str = "novofon",
        timeout_ms: int = 30000,
    ) -> tuple[bool, str]:
        """Инициирует исходящий звонок пациенту. Возвращает (ok, message) — где
        message несёт причину отказа от Asterisk, если Originate отклонён.

        Канал: PJSIP/<phone>@<trunk>. При ответе пациента Asterisk выполняет
        контекст ``ai-outbound`` и приложение AudioSocket с ${CALL_ID}.
        """
        action = {
            "Action": "Originate",
            "Channel": f"PJSIP/{phone}@{trunk}",
            "Context": context,
            "Exten": phone,
            "Priority": "1",
            "Async": "true",
            "Timeout": str(timeout_ms),
            "Variable": f"CALL_ID={call_id}",
        }
        if caller_id:
            action["CallerID"] = caller_id

        resp = await self._run_action(action)
        ok = resp.get("Response") == "Success"
        return ok, resp.get("Message", "")

    async def _run_action(self, action: dict) -> dict:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port), timeout=10.0
            )
        except (OSError, asyncio.TimeoutError) as exc:
            raise AMIError(f"AMI connect failed ({self.host}:{self.port}): {exc}") from exc

        try:
            await self._read_until_banner(reader)
            await self._send(writer, {
                "Action": "Login",
                "Username": self.username,
                "Secret": self.password,
                "Events": "off",  # не хотим поток событий — только ответы на действия
            })
            login_resp = await self._read_response(reader)
            if login_resp.get("Response") != "Success":
                raise AMIError(f"AMI login failed: {login_resp.get('Message', login_resp)}")

            await self._send(writer, action)
            # Пропускаем возможные событийные блоки (Event без Response),
            # чтобы прочитать именно ответ на действие.
            resp = await self._read_response(reader)
            for _ in range(10):
                if "Response" in resp or not resp:
                    break
                resp = await self._read_response(reader)

            # Logoff politely; ignore its response.
            try:
                await self._send(writer, {"Action": "Logoff"})
            except Exception:  # noqa: BLE001
                pass

            if resp.get("Response") != "Success":
                logger.warning("AMI %s rejected: %s", action.get("Action"), resp.get("Message"))
            return resp
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:  # noqa: BLE001
                pass

    @staticmethod
    async def _send(writer: asyncio.StreamWriter, fields: dict) -> None:
        payload = "".join(f"{k}: {v}\r\n" for k, v in fields.items()) + "\r\n"
        writer.write(payload.encode())
        await writer.drain()

    @staticmethod
    async def _read_until_banner(reader: asyncio.StreamReader) -> None:
        # AMI присылает строку-приветствие "Asterisk Call Manager/X.Y\r\n".
        await asyncio.wait_for(reader.readline(), timeout=10.0)

    @staticmethod
    async def _read_response(reader: asyncio.StreamReader) -> dict:
        """Читает один блок ответа (до пустой строки)."""
        result: dict[str, str] = {}
        while True:
            line = await asyncio.wait_for(reader.readline(), timeout=10.0)
            if not line:
                break
            text = line.decode(errors="ignore").rstrip("\r\n")
            if text == "":
                break
            if ":" in text:
                k, _, v = text.partition(":")
                result[k.strip()] = v.strip()
        return result
