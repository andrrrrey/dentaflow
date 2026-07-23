"""Telegram bot service.

Handles incoming Telegram webhook updates, sends replies, and delivers
daily clinic reports.  In development mode all outbound calls are mocked.
This module provides the *service logic* only -- it does NOT run a polling
loop or register handlers with aiogram.

Bot flow:
  /start  → Welcome message + inline keyboard with «📅 Записаться» button
  callback_query "book_appointment" → Show available slots (from 1Denta)
  Any text → AI consultation reply (using knowledge base + OpenAI)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Inline keyboard shown with /start and AI replies
_INLINE_KEYBOARD = {
    "inline_keyboard": [
        [{"text": "📅 Записаться на приём", "callback_data": "book_appointment"}],
        [{"text": "📞 Связаться с клиникой", "callback_data": "contact_clinic"}],
    ]
}


class TelegramBotService:
    """Service-layer wrapper around the Telegram Bot API."""

    def __init__(self, bot_token: str | None = None) -> None:
        self.token = bot_token or settings.TELEGRAM_BOT_TOKEN
        self.base_url = f"https://api.telegram.org/bot{self.token}" if self.token else ""

    # ------------------------------------------------------------------
    # Incoming updates — parse and return structured dict
    # ------------------------------------------------------------------

    async def handle_incoming_message(self, data: dict) -> dict:
        """Parse a Telegram webhook update and return a Communication-like dict.

        Returns extra keys:
          - ``chat_id``      — for auto-reply
          - ``is_command``   — True for /start etc.
          - ``is_callback``  — True for inline button presses
          - ``callback_data`` — payload of the pressed button
        """
        # Callback query (inline button press)
        if "callback_query" in data:
            cq = data["callback_query"]
            chat_id = cq.get("message", {}).get("chat", {}).get("id")
            from_user = cq.get("from", {})
            first_name = from_user.get("first_name", "")
            last_name = from_user.get("last_name", "")
            username = from_user.get("username", "")
            full_name = f"{first_name} {last_name}".strip() or username or str(from_user.get("id"))
            return {
                "channel": "telegram",
                "direction": "inbound",
                "type": "message",
                "content": f"[кнопка] {cq.get('data', '')}",
                "status": "new",
                "priority": "high",
                "external_id": str(cq.get("id")),
                "chat_id": chat_id,
                "telegram_user_id": from_user.get("id"),
                "sender_name": full_name,
                "username": username,
                "is_callback": True,
                "callback_data": cq.get("data", ""),
                "callback_query_id": cq.get("id"),
            }

        message = data.get("message") or data.get("edited_message") or {}
        chat = message.get("chat", {})
        from_user = message.get("from", {})

        chat_id = chat.get("id")
        telegram_user_id = from_user.get("id")
        first_name = from_user.get("first_name", "")
        last_name = from_user.get("last_name", "")
        username = from_user.get("username", "")
        text = message.get("text", "")
        message_id = message.get("message_id")
        full_name = f"{first_name} {last_name}".strip() or username or str(telegram_user_id)

        # Handle contact sharing (request_contact button)
        contact = message.get("contact")
        if contact and not text:
            text = contact.get("phone_number", "")

        # Photo (largest size) — used for review screenshots
        photo_file_id = None
        photos = message.get("photo")
        if photos:
            # Telegram sends an array of sizes ascending; take the largest
            photo_file_id = photos[-1].get("file_id")
        else:
            # Image sent as a document (uncompressed)
            doc = message.get("document") or {}
            if str(doc.get("mime_type", "")).startswith("image/"):
                photo_file_id = doc.get("file_id")

        is_command = text.startswith("/")

        result: dict = {
            "channel": "telegram",
            "direction": "inbound",
            "type": "message",
            "content": text,
            "status": "new",
            "priority": "normal",
            "external_id": str(message_id) if message_id else None,
            "chat_id": chat_id,
            "telegram_user_id": telegram_user_id,
            "sender_name": full_name,
            "username": username,
            "is_command": is_command,
            "is_callback": False,
            "callback_data": None,
            "photo_file_id": photo_file_id,
        }

        logger.info(
            "Telegram message processed: chat_id=%s user=%s text_len=%d",
            chat_id,
            full_name,
            len(text),
        )
        return result

    # ------------------------------------------------------------------
    # Outbound messages
    # ------------------------------------------------------------------

    async def send_reply(self, chat_id: int, text: str, reply_markup: dict | None = None) -> dict:
        """Send a text message to the given *chat_id*."""
        payload: dict = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
        }
        if reply_markup:
            payload["reply_markup"] = json.dumps(reply_markup)

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{self.base_url}/sendMessage", json=payload)
            response.raise_for_status()
            return response.json()

    async def download_file(self, file_id: str) -> tuple[bytes, str] | None:
        """Скачать файл по file_id. Возвращает (bytes, extension) или None."""
        import os

        if not self.base_url or not file_id:
            return None
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                meta = await client.get(f"{self.base_url}/getFile", params={"file_id": file_id})
                meta.raise_for_status()
                file_path = meta.json().get("result", {}).get("file_path")
                if not file_path:
                    return None
                url = f"https://api.telegram.org/file/bot{self.token}/{file_path}"
                resp = await client.get(url)
                resp.raise_for_status()
                ext = os.path.splitext(file_path)[1].lower() or ".jpg"
                return resp.content, ext
        except Exception:
            logger.warning("TelegramBotService: failed to download file %s", file_id)
            return None

    async def answer_callback_query(self, callback_query_id: str, text: str = "") -> None:
        """Acknowledge an inline button press (removes the loading spinner)."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{self.base_url}/answerCallbackQuery",
                json={"callback_query_id": callback_query_id, "text": text},
            )

    async def set_my_commands(self) -> None:
        """Register bot command menu visible when user types '/' in Telegram."""
        commands = [
            {"command": "start",   "description": "🏠 Главное меню"},
            {"command": "book",    "description": "📅 Записаться на приём"},
            {"command": "ask",     "description": "💬 Задать вопрос"},
            {"command": "history", "description": "📋 Мои визиты и оплаты"},
            {"command": "bonus",   "description": "🎁 Бонусная программа"},
            {"command": "manager", "description": "📞 Связаться с менеджером"},
            {"command": "help",    "description": "ℹ️ Помощь — все возможности"},
        ]
        if not self.base_url:
            return
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(f"{self.base_url}/setMyCommands", json={"commands": commands})
                if resp.status_code != 200 or not resp.json().get("ok"):
                    logger.warning("TelegramBotService: setMyCommands failed: %s", resp.text[:300])
                else:
                    logger.info("TelegramBotService: %d bot commands registered", len(commands))
        except Exception:
            logger.warning("TelegramBotService: failed to register bot commands", exc_info=True)

    async def send_daily_report(self, chat_id: int, report: dict) -> None:
        """Format and send an HTML daily report to *chat_id*."""
        html = self._format_report_html(report)
        await self.send_reply(chat_id, html)
        logger.info("Daily report sent to chat_id=%s", chat_id)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

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

    @staticmethod
    def _format_report_html(report: dict) -> str:
        new_patients = report.get("new_patients", 0)
        calls_total = report.get("calls_total", 0)
        calls_missed = report.get("calls_missed", 0)
        messages_total = report.get("messages_total", 0)
        appointments_today = report.get("appointments_today", 0)
        appointments_tomorrow = report.get("appointments_tomorrow", 0)
        revenue = report.get("revenue", 0)
        conversion = report.get("conversion_rate", 0)
        stale_leads = report.get("stale_leads", 0)
        ai_insights = report.get("ai_insights", "")

        lines = [
            "<b>📊 DentaFlow — Ежедневный отчёт</b>\n",
            f"👥 Новых пациентов: <b>{new_patients}</b>",
            f"📞 Звонков: <b>{calls_total}</b> (пропущено: {calls_missed})",
            f"💬 Сообщений: <b>{messages_total}</b>",
            f"📅 Записей сегодня: <b>{appointments_today}</b>",
            f"📅 Записей завтра: <b>{appointments_tomorrow}</b>",
            f"💰 Выручка за день: <b>{revenue:,.0f} ₽</b>",
            f"📈 Конверсия: <b>{conversion:.1f}%</b>",
            f"⚠️ Необработанных лидов: <b>{stale_leads}</b>",
        ]
        if ai_insights:
            lines.append(f"\n{ai_insights}")
        return "\n".join(lines)
