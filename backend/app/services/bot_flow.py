"""Shared conversation flow for Telegram and Max bots.

State machine (stored in Redis per user, TTL 30 min):

  step=""         → no session yet
  step="ai_chat"  → in AI Q&A mode
  step="bk_name"  → booking: waiting for name
  step="bk_phone" → booking: waiting for phone
  step="bk_desc"  → booking: waiting for problem description

Redis key: bot:{channel}:{uid}
History key: hist:{channel}:{uid}

Keyboard builder returns a unified dict:
  {"tg": <Telegram reply_markup dict>, "max": <Max buttons list>}
"""
from __future__ import annotations

import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger(__name__)

_TTL = 1800  # 30-minute session
_HISTORY_TTL = 1800  # same as session TTL
_HISTORY_MAX = 10    # max message pairs to keep
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
# History helpers
# ------------------------------------------------------------------

async def get_history(channel: str, uid) -> list[dict]:
    try:
        val = await _rc().get(f"hist:{channel}:{uid}")
        return json.loads(val) if val else []
    except Exception:
        return []


async def add_to_history(channel: str, uid, role: str, content: str) -> None:
    try:
        hist = await get_history(channel, uid)
        hist.append({"role": role, "content": content})
        if len(hist) > _HISTORY_MAX * 2:
            hist = hist[-_HISTORY_MAX * 2:]
        await _rc().setex(f"hist:{channel}:{uid}", _HISTORY_TTL, json.dumps(hist, ensure_ascii=False))
    except Exception:
        pass


async def clear_history(channel: str, uid) -> None:
    try:
        await _rc().delete(f"hist:{channel}:{uid}")
    except Exception:
        pass


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
            [_tg_btn("📞 Связаться с менеджером", "manager")],
        ]),
        "max": [
            [_max_btn("📅 Записаться на приём", "book")],
            [_max_btn("💬 Задать вопрос", "ask")],
            [_max_btn("📞 Связаться с менеджером", "manager")],
        ],
    }


def kb_back_main() -> dict:
    return {
        "tg": _tg([[_tg_btn("🔙 Главное меню", "menu")]]),
        "max": [[_max_btn("🔙 Главное меню", "menu")]],
    }


def kb_cancel() -> dict:
    return {
        "tg": _tg([[_tg_btn("❌ Отмена", "menu")]]),
        "max": [[_max_btn("❌ Отмена", "menu")]],
    }


def kb_cancel_skip() -> dict:
    return {
        "tg": _tg([[_tg_btn("⏭ Пропустить", "skip"), _tg_btn("❌ Отмена", "menu")]]),
        "max": [[_max_btn("⏭ Пропустить", "skip"), _max_btn("❌ Отмена", "menu")]],
    }


def kb_ai_chat() -> dict:
    """Keyboard shown after each AI reply — quick actions without leaving chat."""
    return {
        "tg": _tg([
            [_tg_btn("📅 Записаться на приём", "ai_book"),
             _tg_btn("📞 Связаться с менеджером", "ai_manager")],
            [_tg_btn("🔙 Главное меню", "menu")],
        ]),
        "max": [
            [_max_btn("📅 Записаться", "ai_book"),
             _max_btn("📞 Менеджер", "ai_manager")],
            [_max_btn("🔙 Главное меню", "menu")],
        ],
    }


_BOOKING_KEYWORDS = {
    "записаться", "запись", "записать", "записан", "приём", "прием",
    "appointment", "хочу попасть", "попасть к врачу",
}
_MANAGER_KEYWORDS = {
    "менеджер", "менеджера", "администратор", "позвоните", "перезвоните",
    "обратный звонок", "свяжитесь", "свяжись",
}


def _detect_intent(text: str) -> str | None:
    t = text.lower()
    if any(kw in t for kw in _BOOKING_KEYWORDS):
        return "book"
    if any(kw in t for kw in _MANAGER_KEYWORDS):
        return "manager"
    return None


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
        await clear_history(channel, uid)
        return reply(_welcome(welcome_message, clinic_name), kb_main())

    # ── Button callbacks ──────────────────────────────────────────────

    if payload == "book":
        await set_state(channel, uid, {**state, "step": "bk_name"})
        return reply("Оставьте ваши контакты.\n\nВведите ваше имя:", kb_cancel())

    if payload == "ask":
        await set_state(channel, uid, {**state, "step": "ai_chat"})
        return reply("💬 Задайте ваш вопрос — я постараюсь помочь!", kb_back_main())

    if payload == "manager":
        await set_state(channel, uid, {**state, "step": "mgr_name"})
        return reply("Введите ваше имя, и менеджер свяжется с вами в ближайшее время:", kb_cancel())

    if payload == "ai_book":
        await set_state(channel, uid, {**state, "step": "ai_lead_name", "lead_type": "book"})
        return reply("Для записи мне нужны ваши контакты.\n\nВведите ваше имя:", kb_cancel())

    if payload == "ai_manager":
        await set_state(channel, uid, {**state, "step": "ai_lead_name", "lead_type": "manager"})
        return reply("Хорошо, передам менеджеру! Введите ваше имя:", kb_cancel())

    if payload.startswith("cancel_appt:"):
        return reply(
            "Для отмены записи позвоните в клинику. Мы поможем выбрать удобное время.",
            kb_main(),
        )

    if payload.startswith("reschedule_appt:"):
        return reply(
            "Для переноса записи позвоните в клинику. Мы подберём удобное время.",
            kb_main(),
        )

    if payload == "back":
        return await _do_back(state, channel, uid)

    # ── skip payload in bk_desc ──────────────────────────────────────

    if payload == "skip" and step == "bk_desc":
        text = ""
        # fall through to bk_desc handling below

    # ── Text messages ─────────────────────────────────────────────────

    if step == "bk_name":
        name = text.strip()
        if not name:
            return reply("Пожалуйста, введите ваше имя:", kb_cancel())
        await set_state(channel, uid, {**state, "step": "bk_phone", "contact_name": name})
        return reply("Введите ваш номер телефона:", kb_cancel())

    if step == "bk_phone":
        phone = text.strip()
        if not phone:
            return reply("Пожалуйста, введите номер телефона:", kb_cancel())
        await set_state(channel, uid, {**state, "step": "bk_desc", "contact_phone": phone})
        return reply(
            "Опишите по желанию вашу проблему или симптомы (или нажмите «Пропустить»):",
            kb_cancel_skip(),
        )

    if step == "bk_desc":
        desc = text.strip() if text else ""
        name = state.get("contact_name", "")
        phone = state.get("contact_phone", "")
        content = f"Запись через бот. Имя: {name}, тел: {phone}. Проблема: {desc or 'не указана'}"
        await clear_state(channel, uid)
        await _update_bot_user_phone(db, channel, str(uid), phone)
        await _create_lead_comm(db, channel, name, phone,
                                comment=content, create_patient=False)
        return reply("Спасибо! Наш администратор свяжется с вами для записи.", kb_main())

    if step == "mgr_name":
        name = text.strip()
        if not name:
            return reply("Пожалуйста, введите ваше имя:", kb_cancel())
        await set_state(channel, uid, {**state, "step": "mgr_phone", "contact_name": name})
        return reply(f"Спасибо, {name}! Введите ваш номер телефона:", kb_cancel())

    if step == "mgr_phone":
        phone = text.strip()
        if not phone:
            return reply("Пожалуйста, введите номер телефона:", kb_cancel())
        name = state.get("contact_name", "")
        await clear_state(channel, uid)
        await _update_bot_user_phone(db, channel, str(uid), phone)
        await _create_lead_comm(db, channel, name, phone,
                                comment="просит перезвонить менеджера", create_patient=False)
        return reply(
            f"Спасибо, {name}! Менеджер свяжется с вами в ближайшее время.",
            kb_main(),
        )

    if step == "ai_lead_name":
        name = text.strip()
        if not name:
            return reply("Пожалуйста, введите ваше имя:", kb_cancel())
        await set_state(channel, uid, {**state, "step": "ai_lead_phone", "contact_name": name})
        return reply(f"Спасибо, {name}! Введите ваш номер телефона:", kb_cancel())

    if step == "ai_lead_phone":
        phone = text.strip()
        if not phone:
            return reply("Пожалуйста, введите номер телефона:", kb_cancel())
        name = state.get("contact_name", "")
        lead_type = state.get("lead_type", "book")
        await clear_state(channel, uid)
        if lead_type == "manager":
            await _create_lead_comm(db, channel, name, phone,
                                    comment="просит перезвонить менеджера", create_patient=False)
            return reply(
                f"Спасибо, {name}! Менеджер свяжется с вами в ближайшее время.",
                kb_main(),
            )
        else:
            await _create_lead_comm(db, channel, name, phone,
                                    comment="перезвонить и записать на прием", create_patient=False)
            return reply(
                f"Спасибо, {name}! Администратор свяжется с вами для записи на приём.",
                kb_main(),
            )

    if step == "ai_chat":
        intent = _detect_intent(text)
        if intent == "book":
            await set_state(channel, uid, {**state, "step": "bk_name"})
            return reply(
                "Конечно, помогу записаться! Оставьте ваши контакты.\n\nВведите ваше имя:",
                kb_cancel(),
            )
        if intent == "manager":
            await set_state(channel, uid, {**state, "step": "ai_lead_name", "lead_type": "manager"})
            return reply(
                "Хорошо, передам менеджеру! Введите ваше имя:",
                kb_cancel(),
            )
        # Add user message to history
        await add_to_history(channel, uid, "user", text)
        history = await get_history(channel, uid)
        r = await ai_svc.chat_with_patient(
            text,
            kb_context=kb_ctx,
            system_prompt=system_prompt,
            history=history[:-1],  # exclude last added
        )
        await add_to_history(channel, uid, "assistant", r)
        return reply(r, kb_ai_chat())

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

async def _create_lead_comm(
    db,
    channel: str,
    name: str,
    phone: str,
    comment: str = "запрос через бот",
    create_patient: bool = True,
) -> None:
    """Create communication (and optionally patient) for a bot lead."""
    try:
        from sqlalchemy import select
        from app.models.patient import Patient
        from app.models.communication import Communication
        from app.services.realtime import realtime

        patient_id = None
        if create_patient and phone:
            stmt = select(Patient).where(Patient.phone == phone).limit(1)
            row = (await db.execute(stmt)).scalar_one_or_none()
            if row:
                patient_id = row.id
            else:
                parts = name.strip().split(None, 2)
                p = Patient(
                    first_name=parts[1] if len(parts) > 1 else "",
                    last_name=parts[0] if parts else name,
                    middle_name=parts[2] if len(parts) > 2 else "",
                    phone=phone,
                )
                db.add(p)
                await db.flush()
                patient_id = p.id

        ch = channel if channel != "tg" else "telegram"
        comm = Communication(
            patient_id=patient_id,
            channel=ch,
            direction="inbound",
            type="message",
            content=comment,
            status="new",
            priority="high",
        )
        db.add(comm)
        await db.commit()
        await realtime.publish("new_communication", {
            "id": str(comm.id), "channel": comm.channel,
            "type": comm.type, "priority": comm.priority,
        })
    except Exception:
        logger.exception("bot_flow: failed to create lead communication")


async def _update_bot_user_phone(db, channel: str, user_id: str, phone: str) -> None:
    """Store phone number on BotUser record so reminders can match by phone."""
    try:
        from sqlalchemy import update as sa_update
        from app.models.bot_user import BotUser
        await db.execute(
            sa_update(BotUser)
            .where(BotUser.channel == channel, BotUser.user_id == user_id)
            .values(phone=phone)
        )
        await db.commit()
    except Exception:
        logger.warning("bot_flow: could not update bot_user phone")


async def _do_back(state: dict, channel: str, uid) -> dict:
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
