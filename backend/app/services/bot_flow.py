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
_CONV_TTL = 7 * 86400  # active conversation link: 7 days
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
# Active open-conversation helpers (post-lead creation)
# ------------------------------------------------------------------

async def get_active_conv(channel: str, uid) -> str | None:
    """Return comm_id if this user has an open conversation."""
    try:
        return await _rc().get(f"conv:{channel}:{uid}")
    except Exception:
        return None


async def set_active_conv(channel: str, uid, comm_id: str) -> None:
    """Store open conversation link (7-day TTL)."""
    try:
        await _rc().setex(f"conv:{channel}:{uid}", _CONV_TTL, comm_id)
    except Exception:
        logger.warning("bot_flow: redis unavailable, conv not tracked")


async def clear_active_conv(channel: str, uid) -> None:
    try:
        await _rc().delete(f"conv:{channel}:{uid}")
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
        # Telegram: remove any leftover ReplyKeyboard; commands live in the ≡ menu
        "tg": {"remove_keyboard": True},
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


def kb_request_phone() -> dict:
    """Phone step keyboard: Telegram shows native contact-share button; Max shows inline cancel."""
    return {
        "tg": {
            "keyboard": [
                [{"text": "📱 Поделиться номером", "request_contact": True}],
                [{"text": "❌ Отмена"}],
            ],
            "one_time_keyboard": True,
            "resize_keyboard": True,
        },
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
    chat_id: str | None = None,
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

    # Text cancel from ReplyKeyboard "❌ Отмена" button
    _CANCEL_TEXTS = {"❌ Отмена", "отмена"}
    if text.strip() in _CANCEL_TEXTS and not payload:
        await clear_state(channel, uid)
        await clear_history(channel, uid)
        return reply(_welcome(welcome_message, clinic_name), kb_main())

    # /start or bot_started — always reset to main menu
    if is_start or payload == "menu":
        await clear_state(channel, uid)
        await clear_history(channel, uid)
        return reply(_welcome(welcome_message, clinic_name), kb_main())

    # ── Button callbacks ──────────────────────────────────────────────

    if payload == "book":
        await set_state(channel, uid, {**state, "step": "bk_name", "chat_id": str(chat_id) if chat_id else ""})
        return reply("Оставьте ваши контакты.\n\nВведите ваше имя:", kb_cancel())

    if payload == "ask":
        await set_state(channel, uid, {**state, "step": "ai_chat"})
        return reply("💬 Задайте ваш вопрос — я постараюсь помочь!", kb_back_main())

    if payload == "manager":
        await set_state(channel, uid, {**state, "step": "mgr_name", "chat_id": str(chat_id) if chat_id else ""})
        return reply("Введите ваше имя, и менеджер свяжется с вами в ближайшее время:", kb_cancel())

    if payload == "ai_book":
        await set_state(channel, uid, {**state, "step": "ai_lead_name", "lead_type": "book", "chat_id": str(chat_id) if chat_id else ""})
        return reply("Для записи мне нужны ваши контакты.\n\nВведите ваше имя:", kb_cancel())

    if payload == "ai_manager":
        await set_state(channel, uid, {**state, "step": "ai_lead_name", "lead_type": "manager", "chat_id": str(chat_id) if chat_id else ""})
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
        return reply("Введите ваш номер телефона:", kb_request_phone())

    if step == "bk_phone":
        phone = text.strip()
        if not phone:
            return reply("Пожалуйста, введите номер телефона:", kb_request_phone())
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
        saved_chat_id = state.get("chat_id")
        await clear_state(channel, uid)
        await _update_bot_user_phone(db, channel, str(uid), phone)
        await _create_lead_comm(db, channel, name, phone,
                                comment=content, create_patient=False,
                                chat_id=saved_chat_id, channel_uid=str(uid))
        return reply("Спасибо! Наш администратор свяжется с вами для записи.", kb_main())

    if step == "mgr_name":
        name = text.strip()
        if not name:
            return reply("Пожалуйста, введите ваше имя:", kb_cancel())
        await set_state(channel, uid, {**state, "step": "mgr_phone", "contact_name": name})
        return reply(f"Спасибо, {name}! Введите ваш номер телефона:", kb_request_phone())

    if step == "mgr_phone":
        phone = text.strip()
        if not phone:
            return reply("Пожалуйста, введите номер телефона:", kb_request_phone())
        name = state.get("contact_name", "")
        await clear_state(channel, uid)
        await _update_bot_user_phone(db, channel, str(uid), phone)
        await _create_lead_comm(db, channel, name, phone,
                                comment=f"Имя: {name}, тел: {phone}. Просит перезвонить менеджера",
                                create_patient=False,
                                chat_id=state.get("chat_id"), channel_uid=str(uid))
        return reply(
            f"Спасибо, {name}! Менеджер свяжется с вами в ближайшее время.",
            kb_main(),
        )

    if step == "ai_lead_name":
        name = text.strip()
        if not name:
            return reply("Пожалуйста, введите ваше имя:", kb_cancel())
        await set_state(channel, uid, {**state, "step": "ai_lead_phone", "contact_name": name})
        return reply(f"Спасибо, {name}! Введите ваш номер телефона:", kb_request_phone())

    if step == "ai_lead_phone":
        phone = text.strip()
        if not phone:
            return reply("Пожалуйста, введите номер телефона:", kb_request_phone())
        name = state.get("contact_name", "")
        lead_type = state.get("lead_type", "book")
        await clear_state(channel, uid)
        if lead_type == "manager":
            await _create_lead_comm(db, channel, name, phone,
                                    comment=f"Имя: {name}, тел: {phone}. Просит перезвонить менеджера",
                                    create_patient=False,
                                    chat_id=state.get("chat_id"), channel_uid=str(uid))
            return reply(
                f"Спасибо, {name}! Менеджер свяжется с вами в ближайшее время.",
                kb_main(),
            )
        else:
            await _create_lead_comm(db, channel, name, phone,
                                    comment=f"Имя: {name}, тел: {phone}. Перезвонить и записать на приём",
                                    create_patient=False,
                                    chat_id=state.get("chat_id"), channel_uid=str(uid))
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
        # Before showing welcome, check for an active open conversation (DB fallback)
        if text.strip() and not step:
            conv_id = await get_active_conv(channel, uid)
            if not conv_id:
                conv_id = await _find_comm_for_user(db, channel, uid)
            if conv_id:
                # Входящее сообщение уже сохранено в тред на уровне вебхука
                return reply("✉️ Получено, менеджер ответит вам здесь.", kb_back_main())
        await clear_state(channel, uid)
        return reply(_welcome(welcome_message, clinic_name), kb_main())

    # User has an active open conversation (post-lead) → save message, ack without menu spam
    conv_id = await get_active_conv(channel, uid)
    if not conv_id:
        conv_id = await _find_comm_for_user(db, channel, uid)
    if conv_id and text.strip():
        # Входящее сообщение уже сохранено в тред на уровне вебхука
        return reply("✉️ Получено, менеджер ответит вам здесь.", kb_back_main())

    # User typed something while in booking flow → nudge
    return reply(
        "Пожалуйста, воспользуйтесь командами /book, /ask, /manager\n"
        "Или напишите вопрос и я постараюсь помочь.",
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
    chat_id: str | None = None,
    channel_uid: str | None = None,
) -> str | None:
    """Create communication (and optionally patient) for a bot lead. Returns comm_id."""
    try:
        from sqlalchemy import select
        from app.models.patient import Patient
        from app.models.communication import Communication
        from app.models.bot_message import BotMessage
        from app.services.realtime import realtime

        from sqlalchemy.sql import func as sa_func

        patient_id = None
        if create_patient and phone:
            stmt = select(Patient).where(Patient.phone == phone).limit(1)
            row = (await db.execute(stmt)).scalars().first()
            if row:
                patient_id = row.id
            else:
                p = Patient(
                    name=name.strip() or "Без имени",
                    phone=phone,
                    source_channel="telegram" if channel == "tg" else channel,
                )
                db.add(p)
                await db.flush()
                patient_id = p.id

        ch = channel if channel != "tg" else "telegram"

        # Вебхук создаёт авточат-тред (type="chat") на каждое сообщение —
        # при захвате лида апгрейдим существующий тред, а не плодим дубликат.
        comm = None
        if channel_uid:
            comm = (await db.execute(
                select(Communication)
                .where(
                    Communication.channel == ch,
                    Communication.bot_channel_uid == str(channel_uid),
                )
                .order_by(Communication.created_at.desc())
                .limit(1)
            )).scalars().first()

        created = comm is None
        if created:
            comm = Communication(
                patient_id=patient_id,
                channel=ch,
                direction="inbound",
                type="message",
                content=comment,
                status="new",
                priority="high",
                bot_chat_id=chat_id or None,
                bot_channel_uid=channel_uid or None,
                last_message_at=sa_func.now(),
            )
            db.add(comm)
            await db.flush()
        else:
            comm.type = "message"  # теперь это лид-тред
            comm.priority = "high"
            comm.status = "new"
            comm.content = comment
            comm.patient_id = comm.patient_id or patient_id
            comm.bot_chat_id = comm.bot_chat_id or (chat_id or None)
            comm.last_message_at = sa_func.now()

        msg = BotMessage(
            communication_id=comm.id,
            direction="inbound",
            content=comment,
            sender_name=name or None,
        )
        db.add(msg)

        await db.commit()

        # Link this user to the created communication for open-chat tracking
        if channel_uid:
            await set_active_conv(channel, channel_uid, str(comm.id))

        await realtime.publish("new_communication", {
            "id": str(comm.id), "channel": comm.channel,
            "type": comm.type, "priority": comm.priority,
        })

        from app.services.deals_service import maybe_create_auto_lead
        lead_title = f"Лид: {name}, {phone}" if phone else f"Лид: {name or 'контакт'} ({ch})"
        await maybe_create_auto_lead(
            channel=ch,
            patient_id=patient_id,
            title=lead_title,
            notes=comment,
        )
        return str(comm.id)
    except Exception:
        logger.exception("bot_flow: failed to create lead communication")
    return None


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


async def _find_comm_for_user(db, channel: str, uid) -> str | None:
    """DB fallback: find most recent open communication for this bot user.

    Used when the Redis conv key is absent (e.g. pre-deploy conversations or
    after Redis restart). Repopulates the Redis cache on success.
    """
    try:
        from sqlalchemy import select
        from app.models.communication import Communication
        ch = channel if channel != "tg" else "telegram"
        stmt = (
            select(Communication.id)
            .where(
                Communication.channel == ch,
                Communication.bot_channel_uid == str(uid),
                # Только лид-треды («менеджер ответит») — авточаты (type="chat")
                # не должны выключать ИИ-ассистента.
                Communication.type == "message",
                Communication.status.in_(["new", "in_progress"]),
            )
            .order_by(Communication.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        if row:
            comm_id = str(row)
            await set_active_conv(channel, uid, comm_id)
            return comm_id
    except Exception:
        logger.warning("bot_flow: DB lookup for active conv failed")
    return None


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
