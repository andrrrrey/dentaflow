"""
Novofon API diagnostic script.

Usage:
    python debug_novofon.py <API_KEY> <API_SECRET>

Run this ON THE SERVER to find which auth format Novofon accepts.
"""

import asyncio
import base64
import hashlib
import hmac as hmac_lib
import sys

import httpx

BASE = "https://api.novofon.com/v1"
ENDPOINT = f"{BASE}/info/balance"


def hmac_sign(api_key: str, api_secret: str, params_str: str = "") -> str:
    params_md5 = hashlib.md5(params_str.encode()).hexdigest()
    data = (params_str + params_md5).encode()
    sig = hmac_lib.new(api_secret.encode(), data, hashlib.sha1).digest()
    return base64.b64encode(sig).decode()


async def try_auth(label: str, headers: dict, params: dict | None = None) -> None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(ENDPOINT, headers=headers, params=params or {})
    status = resp.status_code
    body = resp.text[:200]
    ok = "✅" if status == 200 else "❌"
    print(f"{ok} [{status}] {label}")
    print(f"   Headers sent: {headers}")
    print(f"   Response:     {body}\n")


async def main(api_key: str, api_secret: str) -> None:
    sign = hmac_sign(api_key, api_secret)

    print(f"\nDiagnosing Novofon API auth")
    print(f"Key   : {api_key[:12]}...")
    print(f"Secret: {api_secret[:6]}...")
    print(f"Sign  : {sign}")
    print(f"URL   : {ENDPOINT}\n")
    print("=" * 60)

    # Format 1: Standard Zadarma HMAC (no Bearer)
    await try_auth(
        "key:sign  (Zadarma standard)",
        {"Authorization": f"{api_key}:{sign}"},
    )

    # Format 2: Bearer + key:sign
    await try_auth(
        "Bearer key:sign",
        {"Authorization": f"Bearer {api_key}:{sign}"},
    )

    # Format 3: Bearer + key only
    await try_auth(
        "Bearer key  (no sign)",
        {"Authorization": f"Bearer {api_key}"},
    )

    # Format 4: key:secret directly (no HMAC)
    await try_auth(
        "key:secret  (plain, no HMAC)",
        {"Authorization": f"{api_key}:{api_secret}"},
    )

    # Format 5: Bearer key:secret directly
    await try_auth(
        "Bearer key:secret  (plain, no HMAC)",
        {"Authorization": f"Bearer {api_key}:{api_secret}"},
    )

    # Format 6: Basic auth
    creds = base64.b64encode(f"{api_key}:{api_secret}".encode()).decode()
    await try_auth(
        "Basic base64(key:secret)",
        {"Authorization": f"Basic {creds}"},
    )

    # Format 7: Query params
    await try_auth(
        "Query params: user_key + sign",
        {},
        {"user_key": api_key, "sign": sign},
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python debug_novofon.py <API_KEY> <API_SECRET>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
