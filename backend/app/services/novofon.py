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

    def _auth_header(self, endpoint: str, params: dict | None = None) -> str:
        """Build Novofon Authorization header per official PHP SDK.

        PHP hash_hmac returns hex (no raw=true), so we base64-encode the hex digest.
        'format=json' is always included in params before signing.
        """
        import urllib.parse
        p = dict(params or {})
        p["format"] = "json"
        sorted_items = sorted(p.items())
        params_str = urllib.parse.urlencode(sorted_items)
        params_md5 = hashlib.md5(params_str.encode()).hexdigest()
        data = (endpoint + params_str + params_md5).encode()
        sig_hex = hmac_lib.new(self.api_secret.encode(), data, hashlib.sha1).hexdigest()
        sign = base64.b64encode(sig_hex.encode()).decode()
        return f"{self.api_key}:{sign}"

    def _download_auth_header(self, path: str) -> str:
        """Build Authorization header for a direct file-download URL (no format=json)."""
        params_str = ""
        params_md5 = hashlib.md5(params_str.encode()).hexdigest()
        data = (path + params_str + params_md5).encode()
        sig_hex = hmac_lib.new(self.api_secret.encode(), data, hashlib.sha1).hexdigest()
        sign = base64.b64encode(sig_hex.encode()).decode()
        return f"{self.api_key}:{sign}"

    async def download_recording_bytes(self, url: str) -> bytes | None:
        """Download recording bytes from a Novofon recording URL.

        api.novofon.com URLs: token is embedded in path, try no-auth first.
        my.novofon.ru URLs: require API auth header — try both signing variants.
        """
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path = parsed.path
        is_api_url = (parsed.hostname or "").endswith("novofon.com") and path.startswith("/v1/")

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            # For api.novofon.com/v1/pbx/record/download/... the token is in the URL path
            if is_api_url:
                try:
                    resp = await client.get(url)
                    logger.info("api.novofon.com no-auth: status=%s len=%d", resp.status_code, len(resp.content))
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        return resp.content
                except Exception as exc:
                    logger.debug("api.novofon.com no-auth failed: %s", exc)

            if self.api_key and self.api_secret:
                # Path-signed auth (no format=json — correct for binary file download)
                try:
                    resp = await client.get(url, headers={"Authorization": self._download_auth_header(path)})
                    logger.info("path-auth download: status=%s len=%d url=%.80s", resp.status_code, len(resp.content), url)
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        return resp.content
                except Exception as exc:
                    logger.debug("path-auth download failed: %s", exc)

                # Full HMAC auth with format=json (some Novofon download endpoints use this)
                try:
                    resp = await client.get(url, headers={"Authorization": self._auth_header(path)})
                    logger.info("full-auth download: status=%s len=%d", resp.status_code, len(resp.content))
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        return resp.content
                except Exception as exc:
                    logger.debug("full-auth download failed: %s", exc)

            # Last resort: unauthenticated
            if not is_api_url:
                try:
                    resp = await client.get(url)
                    logger.info("no-auth download: status=%s len=%d url=%.80s", resp.status_code, len(resp.content), url)
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        return resp.content
                except Exception as exc:
                    logger.error("no-auth download failed: %s", exc)

        return None

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

        # Determine communication type — event_type takes priority over duration
        if event_type in ("call_end", "notify_end"):
            comm_type = "call"
            status = "new"
            priority = "normal"
            create_callback_task = False
        elif event_type in ("missed", "notify_out_start"):
            comm_type = "missed_call"
            status = "new"
            priority = "high"
            create_callback_task = True
        elif event_type in ("call_start", "notify_start"):
            # Just ack; full record written on call_end or missed notification
            comm_type = "call"
            status = "new"
            priority = "normal"
            create_callback_task = False
        else:
            # Unknown event — treat as missed to ensure callback task is created
            comm_type = "missed_call"
            status = "new"
            priority = "high"
            create_callback_task = True

        phone = caller if direction == "inbound" else callee
        import json as _json
        content = _json.dumps({"caller_id": caller, "called_did": callee}, ensure_ascii=False)

        result: dict = {
            "channel": "novofon",
            "direction": direction,
            "type": comm_type,
            "content": content,
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

        endpoint = "/v1/request/callback/"
        body = {"from": from_num, "to": to_num}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"https://api.novofon.com{endpoint}",
                headers={"Authorization": self._auth_header(endpoint, body)},
                data={**body, "format": "json"},
            )
            response.raise_for_status()
            return response.json()

    async def get_recording(self, call_id: str) -> str:
        """Return the URL of the call recording for *call_id*.

        Tries call_id as both 'call_id' and 'pbx_call_id' parameters.
        Returns empty string if not found or on any error.
        """
        if settings.APP_ENV == "development":
            return f"https://example.com/recordings/mock-{call_id}.mp3"

        endpoint = "/v1/pbx/record/request/"
        async with httpx.AsyncClient(timeout=15.0) as client:
            for param_name in ("call_id", "pbx_call_id"):
                req_params = {param_name: call_id}
                try:
                    response = await client.get(
                        f"https://api.novofon.com{endpoint}",
                        headers={"Authorization": self._auth_header(endpoint, req_params)},
                        params={**req_params, "format": "json"},
                    )
                    data = response.json()
                    logger.info(
                        "record/request (param=%s call_id=%s) → status=%s data=%s",
                        param_name, call_id, response.status_code, data,
                    )
                    # Single link
                    link = data.get("link") or ""
                    # Multiple links (when pbx_call_id is used)
                    if not link:
                        links = data.get("links") or []
                        if links:
                            first = links[0]
                            link = first if isinstance(first, str) else (first.get("link") or "")
                    if link:
                        return link
                except Exception as exc:
                    logger.debug("record/request (param=%s): %s", param_name, exc)
        return ""

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

        endpoint = "/v1/statistics/pbx/"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://api.novofon.com{endpoint}",
                headers={"Authorization": self._auth_header(endpoint, params)},
                params={**params, "format": "json"},
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
