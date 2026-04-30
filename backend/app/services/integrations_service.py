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
    "novofon": ["novofon_api_key", "novofon_webhook_secret"],
    "one_denta": ["one_denta_api_url", "one_denta_email", "one_denta_password"],
    "openai": ["openai_api_key", "openai_model"],
    "telegram": ["telegram_bot_token", "telegram_webhook_secret", "telegram_owner_chat_id"],
    "max_vk": ["max_api_key", "max_confirmation_token"],
    "site": ["site_webhook_url"],
    "mail": ["mail_host", "mail_port", "mail_user", "mail_password"],
}

ALL_KEYS = [k for keys in INTEGRATION_KEYS.values() for k in keys]

MASKED_KEYS = {
    "novofon_api_key", "novofon_webhook_secret",
    "one_denta_password",
    "openai_api_key",
    "telegram_bot_token", "telegram_webhook_secret",
    "max_api_key", "max_confirmation_token",
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


async def check_connection(service: str, db: AsyncSession) -> dict:
    try:
        if service == "novofon":
            return await _check_novofon(db)
        elif service == "one_denta":
            return await _check_one_denta(db)
        elif service == "openai":
            return await _check_openai(db)
        elif service == "telegram":
            return await _check_telegram(db)
        elif service == "max_vk":
            return await _check_max_vk(db)
        elif service == "site":
            return await _check_site(db)
        elif service == "mail":
            return await _check_mail(db)
        else:
            return {"ok": False, "message": f"Неизвестный сервис: {service}"}
    except Exception as e:
        logger.exception("Connection check failed for %s", service)
        return {"ok": False, "message": str(e)}


def _novofon_sign(api_key: str, api_secret: str, params_str: str = "") -> str:
    """Compute Novofon HMAC-SHA1 signature."""
    params_md5 = hashlib.md5(params_str.encode()).hexdigest()
    data = (params_str + params_md5).encode()
    sig = hmac_lib.new(api_secret.encode(), data, hashlib.sha1).digest()
    return base64.b64encode(sig).decode()


async def _check_novofon(db: AsyncSession) -> dict:
    api_key = await get_raw_value(db, "novofon_api_key") or settings.NOVOFON_API_KEY
    api_secret = await get_raw_value(db, "novofon_webhook_secret") or settings.NOVOFON_WEBHOOK_SECRET
    if not api_key:
        return {"ok": False, "message": "API-ключ не указан"}
    if not api_secret:
        return {"ok": False, "message": "API-secret не указан (поле 'Webhook Secret')"}

    sign = _novofon_sign(api_key, api_secret)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            "https://api.novofon.com/v1/info/balance",
            headers={"Authorization": f"Bearer {api_key}:{sign}"},
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
        detail = body.get("message") or body.get("detail") or resp.text[:200]
        return {"ok": False, "message": f"Ошибка {resp.status_code}: {detail}"}


async def _check_openai(db: AsyncSession) -> dict:
    api_key = await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY
    if not api_key:
        return {"ok": False, "message": "API-ключ не указан"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        if resp.status_code == 200:
            return {"ok": True, "message": "Подключено"}
        if resp.status_code == 401:
            return {"ok": False, "message": "Неверный API-ключ (401)"}
        return {"ok": False, "message": f"Ошибка API: {resp.status_code}"}


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


async def _check_max_vk(db: AsyncSession) -> dict:
    api_key = await get_raw_value(db, "max_api_key")
    if not api_key:
        return {"ok": False, "message": "API-ключ не указан"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            "https://api.vk.com/method/groups.getById",
            params={"access_token": api_key, "v": "5.199"},
        )
        data = resp.json()
        if "response" in data:
            return {"ok": True, "message": "Подключено"}
        err = data.get("error", {}).get("error_msg", "Ошибка")
        return {"ok": False, "message": err}


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
