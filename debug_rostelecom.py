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


def sign(client_id: str, signing_key: str, raw_body: str) -> str:
    # По руководству v7.5: sha256hex(код идентификации + тело JSON + ключ подписи).
    return hashlib.sha256((client_id + raw_body + signing_key).encode("utf-8")).hexdigest()


def call(client_id: str, signing_key: str, method: str, payload: dict) -> None:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    headers = {
        "Content-Type": "application/json",
        "X-Client-ID": client_id,
        "X-Client-Sign": sign(client_id, signing_key, raw),
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

    # Проверка подписи/кода на users_info.
    call(client_id, signing_key, method, {})

    # Проверка формулы подписи на эталонном примере из руководства v7.5.
    if method == "users_info":
        ex_id = "000003C405E6525C64C184258C44EC99"
        ex_key = "00000716ABDA6D4DFF10F82BCBBFC532"
        ex_body = '{"request_number": "+74951234567","from_sipuri": "test_user@cloudpbx.rt.ru"}'
        expected = "fc95a524342dc68df90f7488e6d821c5a8a3b667d585490b50ebf939f1202c36"
        got = hashlib.sha256((ex_id + ex_body + ex_key).encode("utf-8")).hexdigest()
        print(f"\nself-test подписи: {'OK' if got == expected else 'FAIL'} ({got})")


if __name__ == "__main__":
    main()
