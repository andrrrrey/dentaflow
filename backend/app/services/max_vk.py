"""Max / VK service.

Handles VK Callback API events (community messages) and sends replies
via the VK API.  In development mode outbound calls are mocked.
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


class MaxVkService:
    """Service-layer wrapper around the VK Bot / Callback API."""

    VK_API_URL = "https://api.vk.com/method"
    VK_API_VERSION = "5.199"

    def __init__(self) -> None:
        self.api_key = settings.MAX_API_KEY
        self.confirmation_token = settings.MAX_CONFIRMATION_TOKEN

    # ------------------------------------------------------------------
    # Incoming callbacks
    # ------------------------------------------------------------------

    async def handle_callback(self, data: dict) -> dict | str:
        """Process a VK Callback API event.

        * ``type=confirmation`` -- returns the confirmation token string.
        * ``type=message_new``  -- returns a Communication-like dict.
        * Other types are acknowledged with ``{"status": "ignored"}``.
        """
        event_type = data.get("type", "")

        if event_type == "confirmation":
            logger.info("VK confirmation request received")
            return self.confirmation_token or "ok"

        if event_type == "message_new":
            return self._parse_message_new(data)

        logger.debug("VK callback type=%s ignored", event_type)
        return {"status": "ignored", "type": event_type}

    # ------------------------------------------------------------------
    # Outbound messages
    # ------------------------------------------------------------------

    async def send_reply(self, user_id: int, text: str) -> dict:
        """Send a text message to VK user *user_id*."""
        if settings.APP_ENV == "development":
            logger.info("DEV VK send_reply user_id=%s text_len=%d (mock)", user_id, len(text))
            return {"response": 1}

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{self.VK_API_URL}/messages.send",
                data={
                    "user_id": user_id,
                    "message": text,
                    "random_id": uuid.uuid4().int >> 64,
                    "access_token": self.api_key,
                    "v": self.VK_API_VERSION,
                },
            )
            response.raise_for_status()
            return response.json()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _parse_message_new(self, data: dict) -> dict:
        """Extract communication fields from a ``message_new`` event."""
        obj = data.get("object", {})
        message = obj.get("message", obj)

        vk_user_id = message.get("from_id") or message.get("peer_id")
        text = message.get("text", "")
        message_id = message.get("id") or message.get("conversation_message_id")

        result: dict = {
            "channel": "max",
            "direction": "inbound",
            "type": "message",
            "content": text,
            "status": "new",
            "priority": "normal",
            "external_id": str(message_id) if message_id else None,
            "vk_user_id": vk_user_id,
        }

        logger.info(
            "VK message processed: user_id=%s text_len=%d",
            vk_user_id,
            len(text),
        )

        return result
