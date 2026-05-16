"""Novofon telephony service.

Handles incoming call webhooks (call_start, call_end, missed), outbound
call initiation and call-recording retrieval.  In development mode all
external calls are mocked.
"""

from __future__ import annotations

import base64
import hashlib
import hmac as hmac_lib
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class NovofonService:
    """Async wrapper around the Novofon (ex-Zadarma) telephony API."""

    def __init__(self, api_key: str | None = None, api_secret: str | None = None) -> None:
        self.api_key = api_key or settings.NOVOFON_API_KEY
        self.api_secret = api_secret or settings.NOVOFON_WEBHOOK_SECRET
        self.base_url = "https://api.novofon.com/v1"

    def _auth_header(self, endpoint: str, params_str: str = "") -> str:
        """Build Novofon Authorization header: key:base64(HMAC-SHA1(secret, endpoint+params+md5(params)))."""
        params_md5 = hashlib.md5(params_str.encode()).hexdigest()
        data = (endpoint + params_str + params_md5).encode()
        sig = hmac_lib.new(self.api_secret.encode(), data, hashlib.sha1).digest()
        sign = base64.b64encode(sig).decode()
        return f"{self.api_key}:{sign}"

    # ------------------------------------------------------------------
    # Incoming events
    # ------------------------------------------------------------------

    async def handle_call_event(self, event: dict) -> dict:
        """Process a Novofon webhook call event.

        Depending on the event type (``call_start``, ``call_end``,
        ``missed``) this method builds a Communication-like dict
        suitable for persisting to the database.

        Returns a dict with the fields needed to create a Communication
        record plus an optional auto-task flag.
        """
        event_type = event.get("event", event.get("type", "unknown"))
        caller = event.get("caller_id", event.get("from", ""))
        callee = event.get("called_did", event.get("to", ""))
        call_id = event.get("call_id", event.get("pbx_call_id", str(uuid.uuid4())))
        duration = int(event.get("duration", 0))

        direction = "inbound" if event.get("direction") != "outbound" else "outbound"

        # Determine communication type
        if event_type in ("missed", "notify_out_start") or duration == 0:
            comm_type = "missed_call"
            status = "new"
            priority = "high"
            create_callback_task = True
        elif event_type in ("call_end", "notify_end"):
            comm_type = "call"
            status = "new"
            priority = "normal"
            create_callback_task = False
        else:
            # call_start or other — just ack, full processing on call_end
            comm_type = "call"
            status = "new"
            priority = "normal"
            create_callback_task = False

        phone = caller if direction == "inbound" else callee

        result: dict = {
            "channel": "novofon",
            "direction": direction,
            "type": comm_type,
            "content": None,
            "duration_sec": duration,
            "status": status,
            "priority": priority,
            "external_id": call_id,
            "phone": phone,
            "create_callback_task": create_callback_task,
        }

        logger.info(
            "Novofon event processed: type=%s call_id=%s phone=%s duration=%d",
            event_type,
            call_id,
            phone,
            duration,
        )

        return result

    # ------------------------------------------------------------------
    # Outbound actions
    # ------------------------------------------------------------------

    async def make_call(self, from_num: str, to_num: str) -> dict:
        """Initiate an outbound call from *from_num* to *to_num*."""
        if settings.APP_ENV == "development":
            logger.info("DEV make_call %s -> %s (mock)", from_num, to_num)
            return {
                "call_id": f"mock-{uuid.uuid4().hex[:8]}",
                "status": "initiated",
                "from": from_num,
                "to": to_num,
            }

        endpoint = "/v1/request/callback"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"https://api.novofon.com{endpoint}",
                headers={"Authorization": self._auth_header(endpoint)},
                json={"from": from_num, "to": to_num},
            )
            response.raise_for_status()
            return response.json()

    async def get_recording(self, call_id: str) -> str:
        """Return the URL of the call recording for *call_id*."""
        if settings.APP_ENV == "development":
            return f"https://example.com/recordings/mock-{call_id}.mp3"

        endpoint = f"/v1/pbx/record/{call_id}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://api.novofon.com{endpoint}",
                headers={"Authorization": self._auth_header(endpoint)},
            )
            response.raise_for_status()
            data = response.json()
            return data.get("link", "")

    async def get_call_history(
        self,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[dict]:
        """Return recent call history."""
        if not self.api_key:
            return []

        params: dict[str, str] = {}
        if date_from:
            params["start"] = date_from.isoformat()
        if date_to:
            params["end"] = date_to.isoformat()

        endpoint = "/v1/statistics/pbx"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://api.novofon.com{endpoint}",
                headers={"Authorization": self._auth_header(endpoint)},
                params=params,
            )
            response.raise_for_status()
            return response.json().get("stats", [])

    # ------------------------------------------------------------------
    # Mock data
    # ------------------------------------------------------------------

    @staticmethod
    def _mock_call_history() -> list[dict]:
        now = _utcnow()
        return [
            {
                "call_id": "mock-call-001",
                "caller_id": "+79991234567",
                "called_did": "+74951234567",
                "direction": "inbound",
                "duration": 187,
                "status": "answered",
                "started_at": (now - timedelta(hours=1)).isoformat(),
            },
            {
                "call_id": "mock-call-002",
                "caller_id": "+79161112233",
                "called_did": "+74951234567",
                "direction": "inbound",
                "duration": 0,
                "status": "missed",
                "started_at": (now - timedelta(minutes=22)).isoformat(),
            },
            {
                "call_id": "mock-call-003",
                "caller_id": "+74951234567",
                "called_did": "+79109876543",
                "direction": "outbound",
                "duration": 45,
                "status": "answered",
                "started_at": (now - timedelta(hours=4)).isoformat(),
            },
        ]
