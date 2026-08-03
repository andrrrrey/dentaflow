"""Rostelecom «Виртуальная АТС» integration API diagnostic script.

Usage:
    python debug_rostelecom.py <CLIENT_ID> <SIGNING_KEY> [METHOD]

Где:
    CLIENT_ID   — «Уникальный код идентификации» (ЛК → Интеграционный API);
    SIGNING_KEY — «Уникальный ключ для подписи»;
    METHOD      — метод API (по умолчанию users_info).

Запускать НА СЕРВЕРЕ (где есть сетевой доступ к api.cloudpbx.rt.ru и IP в белом
списке), чтобы сверить подпись и реальные имена полей в ответах.
"""

import hashlib
import json
import sys

import httpx

BASE = "https://api.cloudpbx.rt.ru"


def sign(signing_key: str, raw_body: str) -> str:
    return hashlib.sha256((signing_key + raw_body).encode("utf-8")).hexdigest()


def call(client_id: str, signing_key: str, method: str, payload: dict) -> None:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    headers = {
        "Content-Type": "application/json",
        "X-Client-ID": client_id,
        "X-Client-Sign": sign(signing_key, raw),
    }
    url = f"{BASE}/{method.lstrip('/')}"
    print(f"\nPOST {url}")
    print(f"  X-Client-ID   : {client_id}")
    print(f"  X-Client-Sign : {headers['X-Client-Sign']}")
    print(f"  body          : {raw}")
    try:
        resp = httpx.post(url, headers=headers, content=raw.encode("utf-8"), timeout=15.0)
    except Exception as exc:  # noqa: BLE001
        print(f"  ❌ network error: {exc}")
        return
    ok = "✅" if resp.status_code == 200 else "❌"
    print(f"  {ok} [{resp.status_code}] {resp.headers.get('content-type', '')}")
    body = resp.text[:800]
    print(f"  response      : {body}")


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: python debug_rostelecom.py <CLIENT_ID> <SIGNING_KEY> [METHOD]")
        sys.exit(1)
    client_id = sys.argv[1]
    signing_key = sys.argv[2]
    method = sys.argv[3] if len(sys.argv) > 3 else "users_info"

    # Пустой запрос к users_info — быстрая проверка подписи/кода.
    call(client_id, signing_key, method, {})

    # Пример запроса истории звонков — сверить реальные имена полей ответа.
    if method == "users_info":
        call(client_id, signing_key, "domain_call_history", {
            "date_from": "2026-08-01 00:00:00",
            "date_to": "2026-08-03 23:59:59",
        })


if __name__ == "__main__":
    main()
