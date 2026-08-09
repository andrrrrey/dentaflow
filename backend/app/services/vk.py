"""VKontakte community bot service.

ВКонтакте (vk.com) — сообщения сообщества принимаются через Callback API.

Callback API присылает события POST-запросом на webhook URL в формате:
  {
    "type": "confirmation" | "message_new" | ...,
    "group_id": <int>,
    "secret": "<str>",         // если задан в настройках сообщества
    "object": {...}            // для message_new
  }

На "confirmation" сервер обязан вернуть строку-подтверждение простым текстом,
на остальные события — простой текст "ok". Обе задачи решаются в вебхуке
(``routers/webhooks.py``); этот модуль отвечает за парсинг апдейта и вызовы
VK API (отправка ответа, имя отправителя, проверка подключения).

Документация: https://dev.vk.com/ru/api/callback/getting-started
"""

from __future__ import annotations

import logging
import random

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class VkService:
    """Service-layer wrapper around the VK community messaging API."""

    API_URL = "https://api.vk.com/method"

    def __init__(self, access_token: str | None = None, api_version: str = "5.199") -> None:
        # access_token — ключ доступа сообщества (community access token) со scope messages
        self.access_token = access_token or settings.VK_BOT_TOKEN
        self.api_version = api_version

    # ------------------------------------------------------------------
    # Incoming callbacks
    # ------------------------------------------------------------------

    def parse_message_new(self, data: dict) -> dict:
        """Разобрать событие ``message_new`` в «Communication-подобный» dict.

        VK кладёт входящее сообщение в ``object.message`` (API 5.103+).
        Имени отправителя в событии нет — его добирают через :meth:`get_user_name`.
        Исходящие сообщения (от самого сообщества, ``from_id < 0``) следует
        игнорировать в вебхуке.
        """
        obj = data.get("object", {})
        message = obj.get("message", obj)  # на всякий случай поддержим старый формат

        from_id = message.get("from_id")
        peer_id = message.get("peer_id") or from_id
        text = message.get("text", "") or ""
        msg_id = message.get("id") or message.get("conversation_message_id")

        return {
            "channel": "vk",
            "direction": "inbound",
            "type": "message",
            "content": text,
            "status": "new",
            "priority": "normal",
            "external_id": str(msg_id) if msg_id is not None else None,
            "vk_user_id": from_id,
            "vk_peer_id": peer_id,
            "sender_name": None,
        }

    # ------------------------------------------------------------------
    # Outbound messages
    # ------------------------------------------------------------------

    async def send_message(self, peer_id: int, text: str, keyboard: dict | None = None) -> dict:
        """Отправить текстовое сообщение пользователю через ``messages.send``.

        Parameters
        ----------
        peer_id:  идентификатор диалога (для лички = user_id отправителя).
        text:     текст сообщения.
        keyboard: опциональная VK-клавиатура (в v1 не используется).
        """
        params = {
            "access_token": self.access_token,
            "v": self.api_version,
            "peer_id": peer_id,
            "random_id": random.randint(1, 2_000_000_000),
            "message": text,
        }
        if keyboard is not None:
            import json as _json
            params["keyboard"] = _json.dumps(keyboard, ensure_ascii=False)

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(f"{self.API_URL}/messages.send", data=params)
            data = resp.json()
            if "error" in data:
                logger.error("VK messages.send error: %s", data["error"])
            else:
                logger.info("VK messages.send ok: peer_id=%s len=%d", peer_id, len(text))
            return data

    async def get_user_name(self, user_id: int) -> str | None:
        """Получить «Имя Фамилия» пользователя через ``users.get`` (best-effort)."""
        if not user_id or int(user_id) < 0:
            return None
        try:
            params = {
                "access_token": self.access_token,
                "v": self.api_version,
                "user_ids": user_id,
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.API_URL}/users.get", params=params)
                data = resp.json()
            users = data.get("response") or []
            if users:
                u = users[0]
                name = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
                return name or None
        except Exception:
            logger.warning("VK get_user_name failed for user_id=%s", user_id)
        return None

    async def check(self) -> dict:
        """Проверить токен сообщества (для кнопки «Проверить подключение»)."""
        if not self.access_token:
            return {"ok": False, "message": "Ключ доступа сообщества не указан"}
        params = {"access_token": self.access_token, "v": self.api_version}
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.API_URL}/groups.getById", params=params)
            data = resp.json()
        if "error" in data:
            msg = data["error"].get("error_msg", "Ошибка авторизации")
            return {"ok": False, "message": f"Ошибка VK API: {msg}"}
        groups = data.get("response")
        # VK возвращает либо список, либо {"groups": [...]} в зависимости от версии
        if isinstance(groups, dict):
            groups = groups.get("groups") or []
        name = groups[0].get("name") if groups else "сообщество"
        return {"ok": True, "message": f"Подключено ({name})"}
