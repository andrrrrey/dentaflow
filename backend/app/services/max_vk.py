"""Max messenger bot service.

Max (max.ru) — мессенджер от VK Group.
Использует Bot API: https://botapi.max.ru

Документация: https://dev.max.ru/

Входящие события приходят POST-запросом на webhook URL в формате:
  {
    "update_type": "message_created" | "message_callback" | "bot_started" | ...,
    "timestamp": <ms>,
    "message": {...}   // для message_created
    "callback": {...}  // для message_callback
    "user": {...}      // для bot_started
    "chat_id": ...     // для bot_started
  }

В dev-режиме отправка сообщений мокируется.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MaxVkService:
    """Service-layer wrapper around the Max messenger Bot API."""

    API_URL = "https://platform-api.max.ru"

    def __init__(self, bot_token: str | None = None) -> None:
        # bot_token is the access_token issued when creating a bot via @MaxBotAPI in Max messenger
        self.bot_token = bot_token or settings.MAX_API_KEY

    # ------------------------------------------------------------------
    # Incoming callbacks
    # ------------------------------------------------------------------

    async def handle_callback(self, data: dict) -> dict:
        """Process a Max webhook update and return a Communication-like dict.

        Recognised update_type values:
          - ``bot_started``      — user opened the bot (first start)
          - ``message_created``  — incoming text message
          - ``message_callback`` — inline button pressed
          - others              — ignored
        """
        update_type = data.get("update_type", "")

        if update_type == "bot_started":
            return self._parse_bot_started(data)

        if update_type == "message_created":
            return self._parse_message_created(data)

        if update_type == "message_callback":
            return self._parse_message_callback(data)

        logger.debug("Max update_type=%s ignored", update_type)
        return {"status": "ignored", "update_type": update_type}

    # ------------------------------------------------------------------
    # Outbound messages
    # ------------------------------------------------------------------

    async def send_reply(self, chat_id: int, text: str, buttons: list[list[dict]] | None = None) -> dict:
        """Send a text message to a Max chat.

        Parameters
        ----------
        chat_id:  Max chat_id (same as user_id for dialog chats).
        text:     Message text (supports Markdown).
        buttons:  Optional 2-D list of inline buttons.
                  Each button: {"type": "callback", "text": "...", "payload": "..."}
        """
        body: dict = {"text": text}
        if buttons:
            body["attachments"] = [
                {
                    "type": "inline_keyboard",
                    "payload": {"buttons": buttons},
                }
            ]

        headers = {"Authorization": self.bot_token}
        logger.warning("Max send_reply REAL: chat_id=%s text_len=%d payload=%s", chat_id, len(text), str(body)[:200])
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{self.API_URL}/messages",
                headers=headers,
                params={"chat_id": chat_id},
                json=body,
            )
            logger.warning("Max send_reply: status=%s body=%s", response.status_code, response.text[:500])
            response.raise_for_status()
            return response.json()

    async def answer_callback(self, callback_id: str, notification: str = "") -> None:
        """Acknowledge an inline button press."""
        headers = {"Authorization": self.bot_token}
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{self.API_URL}/answers",
                headers=headers,
                json={"callback_id": callback_id, "notification": notification},
            )

    async def register_webhook(self, url: str) -> dict:
        """Register (or update) the bot webhook URL."""
        headers = {"Authorization": self.bot_token}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{self.API_URL}/subscriptions",
                headers=headers,
                json={"url": url},
            )
            response.raise_for_status()
            return response.json()

    # ------------------------------------------------------------------
    # Keyboard helpers
    # ------------------------------------------------------------------

    @staticmethod
    def book_keyboard() -> list[list[dict]]:
        """Return inline keyboard buttons for Max messenger."""
        return [
            [{"type": "callback", "text": "📅 Записаться на приём", "payload": "book_appointment"}],
            [{"type": "callback", "text": "📞 Контакты клиники", "payload": "contact"}],
        ]

    @staticmethod
    def welcome_text(clinic_name: str = "клинике") -> str:
        return (
            f"👋 Добро пожаловать в {clinic_name}!\n\n"
            "Я AI-ассистент и помогу вам:\n"
            "• Узнать об услугах и ценах\n"
            "• Записаться на приём\n"
            "• Ответить на ваши вопросы\n\n"
            "Просто напишите ваш вопрос или нажмите кнопку ниже 👇"
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _parse_message_created(self, data: dict) -> dict:
        message = data.get("message", {})
        sender = message.get("sender", {})
        recipient = message.get("recipient", {})
        body = message.get("body", {})

        user_id = sender.get("user_id")
        chat_id = recipient.get("chat_id") or user_id
        name = sender.get("name", "")
        username = sender.get("username", "")
        text = body.get("text", "")
        mid = body.get("mid") or str(uuid.uuid4())

        return {
            "channel": "max",
            "direction": "inbound",
            "type": "message",
            "content": text,
            "status": "new",
            "priority": "normal",
            "external_id": mid,
            "max_user_id": user_id,
            "max_chat_id": chat_id,
            "sender_name": name or username or str(user_id),
            "update_type": "message_created",
            "is_booking_button": False,
        }

    def _parse_message_callback(self, data: dict) -> dict:
        callback = data.get("callback", {})
        user = callback.get("user", {})
        message = data.get("message", {})
        recipient = message.get("recipient", {})

        user_id = user.get("user_id")
        chat_id = recipient.get("chat_id") or user_id
        payload = callback.get("payload", "")
        callback_id = callback.get("callback_id", "")
        name = user.get("name", "")

        return {
            "channel": "max",
            "direction": "inbound",
            "type": "message",
            "content": f"[кнопка] {payload}",
            "status": "new",
            "priority": "high",
            "external_id": callback_id,
            "max_user_id": user_id,
            "max_chat_id": chat_id,
            "sender_name": name or str(user_id),
            "update_type": "message_callback",
            "callback_id": callback_id,
            "callback_id_payload": payload,
            "is_booking_button": payload in ("book", "book_appointment"),
            "is_callback": True,
        }

    def _parse_bot_started(self, data: dict) -> dict:
        user = data.get("user", {})
        chat_id = data.get("chat_id") or user.get("user_id")
        user_id = user.get("user_id")
        name = user.get("name", "")

        return {
            "channel": "max",
            "direction": "inbound",
            "type": "message",
            "content": "/start",
            "status": "new",
            "priority": "normal",
            "external_id": None,
            "max_user_id": user_id,
            "max_chat_id": chat_id,
            "sender_name": name or str(user_id),
            "update_type": "bot_started",
            "is_booking_button": False,
        }
