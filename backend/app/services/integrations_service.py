"""Service for managing integration settings and checking connections."""

from __future__ import annotations

import base64
import hashlib
import hmac as hmac_lib
import logging
import smtplib

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.integration_setting import IntegrationSetting

logger = logging.getLogger(__name__)

INTEGRATION_KEYS: dict[str, list[str]] = {
    "novofon": [
        "novofon_api_key",
        "novofon_webhook_secret",
        "novofon_sip_login",
        "novofon_sip_password",
        "novofon_sip_server",
        "novofon_caller_id",
    ],
    "one_denta": ["one_denta_api_url", "one_denta_email", "one_denta_password"],
    "openai": ["openai_api_key", "openai_model", "segment_ai_model", "segment_ai_concurrency"],
    "yandex_speechkit": ["yandex_api_key", "yandex_folder_id"],
    "bots": ["bot_welcome_message", "bot_clinic_name"],
    "telegram": [
        "telegram_bot_token",
        "telegram_webhook_secret",
        "telegram_owner_chat_id",
        "telegram_bot_ai_enabled",
        "telegram_bot_system_prompt",
        "telegram_clinic_name",
    ],
    "max_vk": [
        "max_bot_token",
        "max_bot_ai_enabled",
        "max_bot_system_prompt",
        "max_clinic_name",
    ],
    "site": ["site_webhook_url", "tilda_secret"],
    "mail": ["mail_host", "mail_port", "mail_user", "mail_password"],
    "auto_lead": ["auto_lead_enabled", "auto_lead_stage", "auto_lead_channels"],
}

ALL_KEYS = [k for keys in INTEGRATION_KEYS.values() for k in keys]

MASKED_KEYS = {
    "novofon_api_key", "novofon_webhook_secret", "novofon_sip_password",
    "one_denta_password",
    "openai_api_key",
    "yandex_api_key",
    "telegram_bot_token", "telegram_webhook_secret",
    "max_bot_token",
    "tilda_secret",
    "mail_password",
}


def _mask(value: str) -> str:
    if not value or len(value) < 6:
        return "****"
    return value[:3] + "*" * (len(value) - 6) + value[-3:]


async def get_all_settings(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(IntegrationSetting))
    rows = result.scalars().all()
    return {row.key: row.value for row in rows}


async def get_masked_settings(db: AsyncSession) -> dict[str, str]:
    raw = await get_all_settings(db)
    masked: dict[str, str] = {}
    for key in ALL_KEYS:
        val = raw.get(key, "")
        if key in MASKED_KEYS and val:
            masked[key] = _mask(val)
        else:
            masked[key] = val
    return masked


async def save_settings(db: AsyncSession, settings: dict[str, str]) -> None:
    existing = await get_all_settings(db)

    for key, value in settings.items():
        if key not in ALL_KEYS:
            continue
        if isinstance(value, str):
            value = value.strip()
        if key in MASKED_KEYS and value and "*" in value:
            continue

        if key in existing:
            stmt = select(IntegrationSetting).where(IntegrationSetting.key == key)
            result = await db.execute(stmt)
            row = result.scalar_one()
            row.value = value
        else:
            db.add(IntegrationSetting(key=key, value=value))

    await db.flush()


async def get_raw_value(db: AsyncSession, key: str) -> str:
    stmt = select(IntegrationSetting.value).where(IntegrationSetting.key == key)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    return row or ""


async def check_connection(service: str, db: AsyncSession, webhook_url: str | None = None) -> dict:
    try:
        if service == "novofon":
            return await _check_novofon(db)
        elif service == "one_denta":
            return await _check_one_denta(db)
        elif service == "openai":
            return await _check_openai(db)
        elif service == "yandex_speechkit":
            return await _check_yandex_speechkit(db)
        elif service == "telegram":
            return await _check_telegram(db)
        elif service == "max_vk":
            return await _check_max_vk(db, webhook_url=webhook_url)
        elif service == "bots":
            return {"ok": True, "message": "Настройки сохранены"}
        elif service == "site":
            return await _check_site(db)
        elif service == "mail":
            return await _check_mail(db)
        else:
            return {"ok": False, "message": f"Неизвестный сервис: {service}"}
    except Exception as e:
        logger.exception("Connection check failed for %s", service)
        return {"ok": False, "message": str(e)}


def _novofon_sign(api_secret: str, endpoint: str, params: dict | None = None) -> str:
    """Compute Novofon HMAC-SHA1 signature per official PHP SDK.

    PHP: base64_encode(hash_hmac('sha1', method+paramsStr+md5(paramsStr), secret))
    hash_hmac without raw=true returns HEX string, so we base64-encode the hex.
    'format=json' is always included in params (added by the SDK before signing).
    """
    import urllib.parse
    p = dict(params or {})
    p["format"] = "json"
    sorted_items = sorted(p.items())
    params_str = urllib.parse.urlencode(sorted_items)
    params_md5 = hashlib.md5(params_str.encode()).hexdigest()
    data = (endpoint + params_str + params_md5).encode()
    sig_hex = hmac_lib.new(api_secret.encode(), data, hashlib.sha1).hexdigest()
    return base64.b64encode(sig_hex.encode()).decode()


async def _check_novofon(db: AsyncSession) -> dict:
    api_key = await get_raw_value(db, "novofon_api_key") or settings.NOVOFON_API_KEY
    api_secret = await get_raw_value(db, "novofon_webhook_secret") or settings.NOVOFON_WEBHOOK_SECRET
    if not api_key:
        return {"ok": False, "message": "API-ключ не указан"}
    if not api_secret:
        return {"ok": False, "message": "API-secret не указан (поле 'Webhook Secret')"}

    endpoint = "/v1/info/balance/"
    sign = _novofon_sign(api_secret, endpoint)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://api.novofon.com{endpoint}",
            headers={"Authorization": f"{api_key}:{sign}"},
            params={"format": "json"},
        )
        if resp.status_code == 200:
            data = resp.json()
            balance = data.get("balance", "")
            return {"ok": True, "message": f"Подключено. Баланс: {balance}"}
        return {"ok": False, "message": f"Ошибка API: {resp.status_code} — {resp.text[:200]}"}


async def _check_one_denta(db: AsyncSession) -> dict:
    url = (await get_raw_value(db, "one_denta_api_url") or settings.ONE_DENTA_API_URL or "https://crmexchange.1denta.ru").rstrip("/")
    email = await get_raw_value(db, "one_denta_email") or settings.ONE_DENTA_EMAIL
    password = await get_raw_value(db, "one_denta_password") or settings.ONE_DENTA_PASSWORD
    if not email or not password:
        return {"ok": False, "message": "Email или пароль не указаны"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{url}/api/v1/auth",
            json={"email": email, "password": password},
            headers={"Content-Type": "application/json"},
        )
        try:
            body = resp.json()
        except Exception:
            body = {}
        if resp.status_code == 200 and body.get("token"):
            org = body.get("user", {}).get("orgId", "")
            return {"ok": True, "message": f"Подключено (orgId: {org})"}
        detail = body.get("message") or body.get("detail") or body.get("error") or resp.text[:200]
        if resp.status_code == 423:
            return {"ok": False, "message": f"Аккаунт временно заблокирован (слишком много попыток входа). Подождите 15–30 минут и попробуйте снова. Ответ 1Denta: {detail}"}
        return {"ok": False, "message": f"Ошибка {resp.status_code}: {detail}"}


async def _check_openai(db: AsyncSession) -> dict:
    api_key = await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY
    if not api_key:
        return {"ok": False, "message": "API-ключ не указан"}

    model = (
        await get_raw_value(db, "segment_ai_model")
        or await get_raw_value(db, "openai_model")
        or "gpt-4o-mini"
    )
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get("https://api.openai.com/v1/models", headers=headers)
        if resp.status_code == 401:
            return {"ok": False, "message": "Неверный API-ключ (401)"}
        if resp.status_code != 200:
            return {"ok": False, "message": f"Ошибка API: {resp.status_code}"}

        # The key is valid; a minimal completion verifies there is balance —
        # /v1/models returns 200 even when the account is out of quota.
        try:
            chat = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                },
            )
        except httpx.HTTPError:
            # Key proven valid above; treat transient completion errors as OK.
            return {"ok": True, "message": "Подключено"}

        if chat.status_code == 200:
            return {"ok": True, "message": "Подключено"}
        body = chat.text.lower()
        if chat.status_code == 429 and "insufficient_quota" in body:
            return {"ok": False, "message": "Недостаточно средств на счёте OpenAI"}
        if chat.status_code == 429:
            return {"ok": True, "message": "Подключено (достигнут лимит запросов)"}
        if "model" in body and ("does not exist" in body or "not found" in body):
            return {"ok": False, "message": f"Модель «{model}» недоступна для аккаунта"}
        return {"ok": True, "message": "Подключено"}


async def _check_yandex_speechkit(db: AsyncSession) -> dict:
    api_key = await get_raw_value(db, "yandex_api_key")
    folder_id = await get_raw_value(db, "yandex_folder_id")
    if not api_key:
        return {"ok": False, "message": "API-ключ не указан"}
    if not folder_id:
        return {"ok": False, "message": "Folder ID не указан"}

    url = "https://tts.api.cloud.yandex.net:443/tts/v3/utteranceSynthesis"
    body = {
        "text": "тест",
        "hints": [{"voice": "alena"}],
        "output_audio_spec": {
            "raw_audio": {"audio_encoding": "LINEAR16_PCM", "sample_rate_hertz": 8000}
        },
    }
    headers = {"Authorization": f"Api-Key {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code == 200:
            return {"ok": True, "message": "Подключено"}
        if resp.status_code in (401, 403):
            return {"ok": False, "message": "Неверный API-ключ или нет доступа к папке"}
        return {"ok": False, "message": f"Ошибка API: {resp.status_code} — {resp.text[:200]}"}


async def _check_telegram(db: AsyncSession) -> dict:
    token = await get_raw_value(db, "telegram_bot_token")
    if not token:
        return {"ok": False, "message": "Токен бота не указан"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"https://api.telegram.org/bot{token}/getMe")
        data = resp.json()
        if data.get("ok"):
            bot_name = data["result"].get("username", "")
            return {"ok": True, "message": f"Подключено (@{bot_name})"}
        return {"ok": False, "message": data.get("description", "Ошибка")}


async def _check_max_vk(db: AsyncSession, webhook_url: str | None = None) -> dict:
    token = await get_raw_value(db, "max_bot_token")
    if not token:
        return {"ok": False, "message": "Токен бота не указан"}

    headers = {"Authorization": token}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get("https://platform-api.max.ru/me", headers=headers)
        logger.info("Max check /me status=%s body=%s", resp.status_code, resp.text[:400])

        if resp.status_code == 200:
            data = resp.json()
            name = data.get("name") or data.get("username") or "бот"
            if webhook_url:
                try:
                    reg = await client.post(
                        "https://platform-api.max.ru/subscriptions",
                        headers=headers,
                        json={"url": webhook_url},
                    )
                    logger.info("Max webhook reg: status=%s body=%s", reg.status_code, reg.text[:300])
                    if reg.status_code == 200:
                        return {"ok": True, "message": f"Подключено ({name}), webhook зарегистрирован"}
                    logger.warning("Max webhook reg error %s: %s", reg.status_code, reg.text[:200])
                except Exception:
                    logger.exception("Max webhook registration failed")
            return {"ok": True, "message": f"Подключено ({name})"}

        return {"ok": False, "message": f"Ошибка {resp.status_code}: {resp.text[:300]}"}


async def _check_site(db: AsyncSession) -> dict:
    url = await get_raw_value(db, "site_webhook_url")
    if not url:
        return {"ok": False, "message": "URL не указан"}
    if url.startswith("http://") or url.startswith("https://"):
        return {"ok": True, "message": "URL настроен"}
    return {"ok": False, "message": "Некорректный URL"}


async def _check_mail(db: AsyncSession) -> dict:
    host = await get_raw_value(db, "mail_host")
    port_str = await get_raw_value(db, "mail_port")
    user = await get_raw_value(db, "mail_user")
    password = await get_raw_value(db, "mail_password")

    if not host or not user or not password:
        return {"ok": False, "message": "Не все поля заполнены"}

    port = int(port_str) if port_str else 465

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            server = smtplib.SMTP(host, port, timeout=10)
            server.starttls()
        server.login(user, password)
        server.quit()
        return {"ok": True, "message": "Подключено"}
    except Exception as e:
        return {"ok": False, "message": str(e)}
