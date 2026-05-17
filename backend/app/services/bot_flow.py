"""Shared conversation flow for Telegram and Max bots.

State machine (stored in Redis per user, TTL 30 min):

  step=""         → no session yet
  step="ai_chat"  → in AI Q&A mode
  step="bk_svc"   → selecting service (booking)
  step="bk_date"  → selecting date   (booking)
  step="bk_slot"  → selecting slot   (booking)
  step="bk_conf"  → confirming booking

Redis key: bot:{channel}:{uid}

Keyboard builder returns a unified dict:
  {"tg": <Telegram reply_markup dict>, "max": <Max buttons list>}
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger(__name__)

_TTL = 1800  # 30-minute session
_redis_client = None


def _rc():
    global _redis_client
    if _redis_client is None:
        import redis.asyncio as aioredis
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


# ------------------------------------------------------------------
# State helpers
# ------------------------------------------------------------------

async def get_state(channel: str, uid) -> dict:
    try:
        val = await _rc().get(f"bot:{channel}:{uid}")
        return json.loads(val) if val else {}
    except Exception:
        return {}


async def set_state(channel: str, uid, state: dict) -> None:
    try:
        await _rc().setex(f"bot:{channel}:{uid}", _TTL, json.dumps(state, ensure_ascii=False))
    except Exception:
        logger.warning("bot_flow: redis unavailable, state not persisted")


async def clear_state(channel: str, uid) -> None:
    try:
        await _rc().delete(f"bot:{channel}:{uid}")
    except Exception:
        pass


# ------------------------------------------------------------------
# Data helpers
# ------------------------------------------------------------------

async def load_services(db: AsyncSession) -> list[dict]:
    """Return services from directory cache (no API call needed)."""
    try:
        from sqlalchemy import select
        from app.models.directory_cache import DirectoryCache
        stmt = select(DirectoryCache).where(DirectoryCache.category == "service").limit(10)
        rows = (await db.execute(stmt)).scalars().all()
        return [{"id": r.external_id or str(i), "name": r.name} for i, r in enumerate(rows)]
    except Exception:
        logger.exception("bot_flow: failed to load services")
        return []


async def load_slots(service_id: str, date_str: str) -> list[dict]:
    """Return available time slots from 1Denta across all doctors."""
    try:
        from app.services.one_denta import OneDentaService
        od = OneDentaService()
        resources = await od.get_resources() or []
        svc_ids = [service_id] if service_id else ["1"]
        slots: list[dict] = []
        for res in resources[:6]:
            rid = str(res.get("external_id") or res.get("id") or "")
            doc = res.get("name", "Врач")
            if not rid:
                continue
            times = await od.get_available_slots(rid, svc_ids, date_str)
            for t in times or []:
                dt_str = str(t)
                time_part = dt_str[11:16] if len(dt_str) > 10 else dt_str
                slots.append({"dt": dt_str, "time": time_part, "doctor": doc, "doctor_id": rid})
        return slots[:10]
    except Exception:
        logger.exception("bot_flow: failed to load slots")
        return []


# ------------------------------------------------------------------
# Keyboard builders
# ------------------------------------------------------------------

def _tg(rows: list[list[dict]]) -> dict:
    return {"inline_keyboard": rows}


def _tg_btn(text: str, data: str) -> dict:
    return {"text": text, "callback_data": data[:64]}


def _max_btn(text: str, payload: str) -> dict:
    return {"type": "callback", "text": text[:40], "payload": payload[:64]}


def kb_main() -> dict:
    return {
        "tg": _tg([
            [_tg_btn("📅 Записаться на приём", "book")],
            [_tg_btn("💬 Задать вопрос", "ask")],
        ]),
        "max": [
            [_max_btn("📅 Записаться на приём", "book")],
            [_max_btn("💬 Задать вопрос", "ask")],
        ],
    }


def kb_back_main() -> dict:
    return {
        "tg": _tg([[_tg_btn("🔙 Главное меню", "menu")]]),
        "max": [[_max_btn("🔙 Главное меню", "menu")]],
    }


def kb_services(services: list[dict]) -> dict:
    tg_rows = [[_tg_btn(s["name"][:40], f"svc:{i}")] for i, s in enumerate(services)]
    tg_rows.append([_tg_btn("🔙 Назад", "menu")])
    max_rows = [[_max_btn(s["name"][:40], f"svc:{i}")] for i, s in enumerate(services)]
    max_rows.append([_max_btn("🔙 Назад", "menu")])
    return {"tg": _tg(tg_rows), "max": max_rows}


def kb_dates() -> dict:
    MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
    today = date.today()
    tg_rows, max_rows = [], []
    for i in range(7):
        d = today + timedelta(days=i)
        label = (
            f"Сегодня, {d.day} {MONTHS[d.month-1]}" if i == 0
            else f"Завтра, {d.day} {MONTHS[d.month-1]}" if i == 1
            else f"{d.day} {MONTHS[d.month-1]}"
        )
        payload = f"dt:{d.isoformat()}"
        tg_rows.append([_tg_btn(label, payload)])
        max_rows.append([_max_btn(label, payload)])
    tg_rows.append([_tg_btn("🔙 Назад", "back")])
    max_rows.append([_max_btn("🔙 Назад", "back")])
    return {"tg": _tg(tg_rows), "max": max_rows}


def kb_slots(slots: list[dict]) -> dict:
    tg_rows = [[_tg_btn(f"🕐 {s['time']} — {s['doctor']}", f"slot:{i}")] for i, s in enumerate(slots)]
    tg_rows.append([_tg_btn("🔙 Назад", "back")])
    max_rows = [[_max_btn(f"🕐 {s['time']} — {s['doctor']}", f"slot:{i}")] for i, s in enumerate(slots)]
    max_rows.append([_max_btn("🔙 Назад", "back")])
    return {"tg": _tg(tg_rows), "max": max_rows}


def kb_confirm() -> dict:
    return {
        "tg": _tg([
            [_tg_btn("✅ Подтвердить запись", "confirm")],
            [_tg_btn("🔙 Выбрать другое время", "back")],
        ]),
        "max": [
            [_max_btn("✅ Подтвердить запись", "confirm")],
            [_max_btn("🔙 Выбрать другое время", "back")],
        ],
    }


# ------------------------------------------------------------------
# Reply builder
# ------------------------------------------------------------------

def reply(text: str, kb: dict) -> dict:
    return {"text": text, "kb": kb}


# ------------------------------------------------------------------
# Main event processor
# ------------------------------------------------------------------

async def process(
    *,
    channel: str,
    uid,
    is_start: bool = False,
    payload: str = "",
    text: str = "",
    db: AsyncSession,
    clinic_name: str,
    welcome_message: str,
    ai_svc,
    kb_ctx: str,
    system_prompt: str,
) -> dict:
    """Process one bot event and return reply(text, kb)."""

    state = await get_state(channel, uid)
    step = state.get("step", "")

    # /start or bot_started — always reset to main menu
    if is_start or payload == "menu":
        await clear_state(channel, uid)
        return reply(_welcome(welcome_message, clinic_name), kb_main())

    # ── Button callbacks ──────────────────────────────────────────────

    if payload == "book":
        services = await load_services(db)
        if not services:
            # 1Denta not configured — fall back to AI booking intent
            await set_state(channel, uid, {**state, "step": "ai_chat"})
            r = await ai_svc.chat_with_patient(
                "Пациент хочет записаться на приём. Помоги ему.",
                kb_context=kb_ctx, system_prompt=system_prompt,
            )
            return reply(r, kb_back_main())
        await set_state(channel, uid, {"step": "bk_svc", "services": services})
        return reply("Выберите услугу:", kb_services(services))

    if payload == "ask":
        await set_state(channel, uid, {**state, "step": "ai_chat"})
        return reply("💬 Задайте ваш вопрос — я постараюсь помочь!", kb_back_main())

    if payload.startswith("svc:"):
        services = state.get("services", [])
        try:
            idx = int(payload.split(":")[1])
            svc = services[idx]
        except (IndexError, ValueError, KeyError):
            return reply("Услуга не найдена. Попробуйте снова.", kb_main())
        await set_state(channel, uid, {**state, "step": "bk_date",
                                       "service_id": svc["id"], "service_name": svc["name"]})
        return reply(
            f"Вы выбрали: <b>{svc['name']}</b>\n\nВыберите удобную дату:",
            kb_dates(),
        )

    if payload.startswith("dt:"):
        date_str = payload[3:]
        service_id = state.get("service_id", "")
        service_name = state.get("service_name", "")
        slots = await load_slots(service_id, date_str)
        if not slots:
            return reply(
                f"На выбранную дату свободных мест не нашлось 😔\n"
                "Попробуйте другой день:",
                kb_dates(),
            )
        await set_state(channel, uid, {**state, "step": "bk_slot",
                                       "date": date_str, "slots": slots})
        return reply(
            f"📅 {date_str}  |  {service_name}\n\nВыберите удобное время:",
            kb_slots(slots),
        )

    if payload.startswith("slot:"):
        slots = state.get("slots", [])
        try:
            idx = int(payload.split(":")[1])
            slot = slots[idx]
        except (IndexError, ValueError):
            return reply("Слот не найден. Выберите снова.", kb_dates())
        await set_state(channel, uid, {**state, "step": "bk_conf", "slot_idx": idx})
        return reply(
            f"✅ Вы выбрали:\n\n"
            f"🦷 <b>{state.get('service_name', '')}</b>\n"
            f"📅 {state.get('date', '')}\n"
            f"🕐 {slot['time']}\n"
            f"👨‍⚕️ {slot['doctor']}\n\n"
            "Подтвердить запись?",
            kb_confirm(),
        )

    if payload == "confirm":
        return await _do_confirm(state, channel, uid, clinic_name)

    if payload == "back":
        return await _do_back(state, channel, uid)

    # ── Text messages ─────────────────────────────────────────────────

    if step == "ai_chat":
        r = await ai_svc.chat_with_patient(text, kb_context=kb_ctx, system_prompt=system_prompt)
        return reply(r, kb_back_main())

    # First message or unknown state → welcome
    if not step or not text.strip():
        await clear_state(channel, uid)
        return reply(_welcome(welcome_message, clinic_name), kb_main())

    # User typed something while in booking flow → nudge
    return reply(
        "Пожалуйста, воспользуйтесь кнопками меню 👇\n"
        "Или нажмите «💬 Задать вопрос» чтобы написать вопрос AI-ассистенту.",
        kb_main(),
    )


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------

async def _do_confirm(state: dict, channel: str, uid, clinic_name: str) -> dict:
    slots: list[dict] = state.get("slots", [])
    slot_idx: int = state.get("slot_idx", 0)
    slot = slots[slot_idx] if slot_idx < len(slots) else {}
    service_id = state.get("service_id", "")
    service_name = state.get("service_name", "")
    date_str = state.get("date", "")

    booked = False
    try:
        from datetime import datetime as dt_cls
        from app.services.one_denta import OneDentaService
        doctor_id = slot.get("doctor_id", "")
        dt_raw = slot.get("dt", "")
        if doctor_id and dt_raw:
            od = OneDentaService()
            await od.create_visit(
                name="Пациент из бота",
                phone="",
                email="",
                service_ids=[service_id] if service_id else [],
                resource_id=doctor_id,
                dt=dt_cls.fromisoformat(dt_raw),
                comment=f"Запись через бот ({channel})",
            )
            booked = True
    except Exception:
        logger.exception("bot_flow: create_visit failed")

    await clear_state(channel, uid)

    if booked:
        text = (
            f"🎉 <b>Запись подтверждена!</b>\n\n"
            f"🦷 {service_name}\n"
            f"📅 {date_str}, {slot.get('time', '')}\n"
            f"👨‍⚕️ {slot.get('doctor', '')}\n\n"
            "Ждём вас! Клиника свяжется с вами для подтверждения."
        )
    else:
        text = (
            f"📋 <b>Заявка принята!</b>\n\n"
            f"🦷 {service_name}\n"
            f"📅 {date_str}, {slot.get('time', '')}\n"
            f"👨‍⚕️ {slot.get('doctor', '')}\n\n"
            "Администратор клиники свяжется с вами для подтверждения записи."
        )
    return reply(text, kb_main())


async def _do_back(state: dict, channel: str, uid) -> dict:
    step = state.get("step", "")
    if step == "bk_date":
        services = state.get("services", [])
        return reply("Выберите услугу:", kb_services(services))
    if step == "bk_slot":
        return reply("Выберите удобную дату:", kb_dates())
    if step == "bk_conf":
        slots = state.get("slots", [])
        return reply("Выберите удобное время:", kb_slots(slots))
    await clear_state(channel, uid)
    return reply("Главное меню:", kb_main())


def _welcome(welcome_message: str, clinic_name: str) -> str:
    if welcome_message and welcome_message.strip():
        return welcome_message.strip()
    name = clinic_name or "нашу клинику"
    return (
        f"👋 Добро пожаловать в {name}!\n\n"
        "Я AI-ассистент и готов помочь:\n"
        "• Записаться на приём\n"
        "• Ответить на вопросы об услугах и ценах\n\n"
        "Выберите действие 👇"
    )
