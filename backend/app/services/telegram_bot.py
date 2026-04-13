"""Telegram bot service.

Handles incoming Telegram webhook updates, sends replies, and delivers
daily clinic reports.  In development mode all outbound calls are mocked.
This module provides the *service logic* only -- it does NOT run a polling
loop or register handlers with aiogram.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TelegramBotService:
    """Service-layer wrapper around the Telegram Bot API."""

    def __init__(self) -> None:
        self.token = settings.TELEGRAM_BOT_TOKEN
        self.base_url = f"https://api.telegram.org/bot{self.token}" if self.token else ""

    # ------------------------------------------------------------------
    # Incoming updates
    # ------------------------------------------------------------------

    async def handle_incoming_message(self, data: dict) -> dict:
        """Parse a Telegram webhook update and return a Communication-like dict.

        The returned dict contains all fields needed to persist a
        ``Communication`` record and optionally link/create a patient.
        """
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

        # Build a display name
        full_name = f"{first_name} {last_name}".strip() or username or str(telegram_user_id)

        result: dict = {
            "channel": "telegram",
            "direction": "inbound",
            "type": "message",
            "content": text,
            "status": "new",
            "priority": "normal",
            "external_id": str(message_id) if message_id else None,
            "telegram_chat_id": chat_id,
            "telegram_user_id": telegram_user_id,
            "sender_name": full_name,
            "username": username,
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

    async def send_reply(self, chat_id: int, text: str) -> dict:
        """Send a text message to the given *chat_id*."""
        if settings.APP_ENV == "development":
            logger.info("DEV send_reply chat_id=%s text_len=%d (mock)", chat_id, len(text))
            return {"ok": True, "message_id": 123, "chat_id": chat_id}

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{self.base_url}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                },
            )
            response.raise_for_status()
            return response.json()

    async def send_daily_report(self, chat_id: int, report: dict) -> None:
        """Format and send an HTML daily report to *chat_id*.

        The *report* dict is expected to contain KPI keys such as
        ``new_patients``, ``calls_total``, ``revenue``, etc.
        """
        html = self._format_report_html(report)
        await self.send_reply(chat_id, html)
        logger.info("Daily report sent to chat_id=%s", chat_id)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

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

        return (
            "<b>📊 DentaFlow — Ежедневный отчёт</b>\n\n"
            f"👥 Новых пациентов: <b>{new_patients}</b>\n"
            f"📞 Звонков: <b>{calls_total}</b> (пропущено: {calls_missed})\n"
            f"💬 Сообщений: <b>{messages_total}</b>\n"
            f"📅 Записей сегодня: <b>{appointments_today}</b>\n"
            f"📅 Записей завтра: <b>{appointments_tomorrow}</b>\n"
            f"💰 Выручка за день: <b>{revenue:,.0f} ₽</b>\n"
            f"📈 Конверсия: <b>{conversion:.1f}%</b>\n"
            f"⚠️ Не обработанных лидов: <b>{stale_leads}</b>\n"
            f"\n{ai_insights}" if ai_insights else ""
        )
