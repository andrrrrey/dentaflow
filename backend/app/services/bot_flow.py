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


# Единый набор пунктов главного меню — используется и для Telegram, и для Max,
# чтобы кнопки (и эмодзи на них) везде были одинаковыми.
_MAIN_MENU = [
    ("📅 Записаться на приём", "book"),
    ("💬 Задать вопрос", "ask"),
    ("📋 Мои визиты и оплаты", "history"),
    ("🎁 Бонусная программа", "bonus"),
    ("☎️ Изменить номер телефона", "change_phone"),
    ("📞 Связаться с менеджером", "manager"),
    ("ℹ️ Помощь", "help"),
]


def kb_main() -> dict:
    return {
        # Telegram: показываем главное меню инлайн-кнопками с эмодзи —
        # так первичный онбординг нагляднее, чем скрытое меню команд «/».
        "tg": _tg([[_tg_btn(text, payload)] for text, payload in _MAIN_MENU]),
        "max": [[_max_btn(text, payload)] for text, payload in _MAIN_MENU],
    }


def kb_bonus() -> dict:
    """Keyboard inside the bonus section — action to send a review screenshot."""
    return {
        "tg": _tg([
            [_tg_btn("📤 Отправить скриншот отзыва", "bonus_review")],
            [_tg_btn("🔙 Главное меню", "menu")],
        ]),
        "max": [
            [_max_btn("📤 Отправить скриншот отзыва", "bonus_review")],
            [_max_btn("🔙 Главное меню", "menu")],
        ],
    }


def kb_back_main() -> dict:
    return {
        "tg": _tg([[_tg_btn("🔙 Главное меню", "menu")]]),
        "max": [[_max_btn("🔙 Главное меню", "menu")]],
    }


def kb_history() -> dict:
    """Клавиатура под историей визитов — с возможностью изменить номер."""
    return {
        "tg": _tg([
            [_tg_btn("☎️ Изменить номер телефона", "change_phone")],
            [_tg_btn("🔙 Главное меню", "menu")],
        ]),
        "max": [
            [_max_btn("☎️ Изменить номер", "change_phone")],
            [_max_btn("🔙 Главное меню", "menu")],
        ],
    }


def kb_patient_choice(candidates: list[tuple[str, str]]) -> dict:
    """Выбор пациента, когда по номеру найдено несколько карт.

    ``candidates`` — список (patient_id, label). Добавляем пункт «Нет такого
    пациента» (номер попал по ошибке) и возврат в меню.
    """
    tg_rows = [[_tg_btn(label, f"pick_patient:{pid}")] for pid, label in candidates]
    tg_rows.append([_tg_btn("🚫 Нет такого пациента", "no_patient")])
    tg_rows.append([_tg_btn("🔙 Главное меню", "menu")])
    max_rows = [[_max_btn(label, f"pick_patient:{pid}")] for pid, label in candidates]
    max_rows.append([_max_btn("🚫 Нет такого пациента", "no_patient")])
    max_rows.append([_max_btn("🔙 Главное меню", "menu")])
    return {"tg": _tg(tg_rows), "max": max_rows}


def kb_lead_saved(change_payload: str) -> dict:
    """Клавиатура после заявки по сохранённым контактам — с опцией их изменить."""
    return {
        "tg": _tg([
            [_tg_btn("✏️ Указать другие контакты", change_payload)],
            [_tg_btn("🔙 Главное меню", "menu")],
        ]),
        "max": [
            [_max_btn("✏️ Другие контакты", change_payload)],
            [_max_btn("🔙 Главное меню", "menu")],
        ],
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

    # Быстрые текстовые команды «меню» / «помощь» — работают вне активных сценариев
    # (в сценариях ввода имени/телефона текст обрабатывается как данные).
    _plain = text.strip().lower().lstrip("/")
    if not payload and not step and _plain in ("меню", "menu", "главное меню"):
        await clear_state(channel, uid)
        await clear_history(channel, uid)
        return reply(_welcome(welcome_message, clinic_name), kb_main())
    if not payload and not step and _plain in ("помощь", "help", "справка"):
        return reply(_help_text(clinic_name), kb_main())

    # /start or bot_started — always reset to main menu
    if is_start or payload == "menu":
        await clear_state(channel, uid)
        await clear_history(channel, uid)
        return reply(_welcome(welcome_message, clinic_name), kb_main())

    # ── Button callbacks ──────────────────────────────────────────────

    if payload in ("book", "book_new"):
        cid = str(chat_id) if chat_id else ""
        if payload == "book":
            # Уже знаем контакты — не переспрашиваем имя и телефон, сразу к сути.
            name, phone = await _get_known_contact(db, channel, uid)
            if name and phone:
                await set_state(channel, uid, {
                    **state, "step": "bk_desc",
                    "contact_name": name, "contact_phone": phone, "chat_id": cid,
                })
                return reply(
                    f"{name}, запишем вас по номеру <b>{phone}</b>.\n\n"
                    "Опишите по желанию, что вас беспокоит (или нажмите «Пропустить»). "
                    "Если номер изменился — нажмите «❌ Отмена» и начните заново.",
                    kb_cancel_skip(),
                )
        await set_state(channel, uid, {**state, "step": "bk_name", "chat_id": cid})
        return reply("Оставьте ваши контакты.\n\nВведите ваше имя:", kb_cancel())

    if payload == "ask":
        await set_state(channel, uid, {**state, "step": "ai_chat"})
        return reply("💬 Задайте ваш вопрос — я постараюсь помочь!", kb_back_main())

    if payload == "help":
        await clear_state(channel, uid)
        return reply(_help_text(clinic_name), kb_main())

    if payload in ("manager", "manager_new"):
        cid = str(chat_id) if chat_id else ""
        if payload == "manager":
            # Контакты уже известны — сразу создаём заявку, не переспрашивая.
            name, phone = await _get_known_contact(db, channel, uid)
            if name and phone:
                await clear_state(channel, uid)
                await _create_lead_comm(
                    db, channel, name, phone,
                    comment=f"Имя: {name}, тел: {phone}. Просит перезвонить менеджера",
                    create_patient=False, chat_id=cid, channel_uid=str(uid),
                )
                return reply(
                    f"Спасибо, {name}! Менеджер свяжется с вами по номеру "
                    f"<b>{phone}</b> в ближайшее время.",
                    kb_lead_saved("manager_new"),
                )
        await set_state(channel, uid, {**state, "step": "mgr_name", "chat_id": cid})
        return reply("Введите ваше имя, и менеджер свяжется с вами в ближайшее время:", kb_cancel())

    if payload == "history":
        return await _resolve_and_dispatch(
            db, channel, uid, "history",
            "Чтобы показать историю визитов, укажите номер телефона, "
            "по которому вы записаны в клинике:",
        )

    if payload == "bonus":
        return await _resolve_and_dispatch(
            db, channel, uid, "bonus",
            "Чтобы открыть бонусную программу, укажите номер телефона, "
            "по которому вы записаны в клинике:",
        )

    if payload == "change_phone":
        return await _resolve_and_dispatch(
            db, channel, uid, "change_phone",
            "Чтобы изменить номер, сначала укажите ваш текущий номер телефона, "
            "по которому вы записаны в клинике:",
        )

    if payload.startswith("pick_patient:"):
        pid = payload.split(":", 1)[1]
        after = state.get("after", "history")
        candidates = state.get("candidates") or []
        if candidates and pid not in candidates:
            return reply("Этот выбор уже неактуален. Откройте раздел заново из меню.", kb_main())
        patient = await _get_patient_by_id(db, pid)
        if patient is None:
            return reply("Не удалось найти выбранного пациента. Попробуйте снова из меню.", kb_main())
        await _set_linked_patient(db, channel, uid, patient.id)
        return await _dispatch_after(db, channel, uid, patient, after)

    if payload == "no_patient":
        bad_phone = state.get("phone") or await _stored_phone(db, channel, uid) or ""
        candidate_ids = state.get("candidates") or []
        await clear_state(channel, uid)
        await _notify_bad_phone(db, channel, bad_phone, candidate_ids)
        return reply(
            "Спасибо! Мы передали администратору, что этот номер требует проверки. "
            "Если у вас другой номер — укажите его через «☎️ Изменить номер телефона».",
            kb_main(),
        )

    if payload == "bonus_review":
        patient = await _resolve_patient(db, channel, uid)
        if patient is None:
            await set_state(channel, uid, {**state, "step": "link_phone", "after": "bonus"})
            return reply(
                "Сначала укажите номер телефона, по которому вы записаны в клинике:",
                kb_request_phone(),
            )
        await set_state(channel, uid, {**state, "step": "review_wait"})
        return reply(
            "📸 Пришлите скриншот вашего отзыва одним изображением. "
            "После проверки администратором мы начислим вам баллы.",
            kb_back_main(),
        )

    if payload == "ai_book":
        cid = str(chat_id) if chat_id else ""
        name, phone = await _get_known_contact(db, channel, uid)
        if name and phone:
            await clear_state(channel, uid)
            await _create_lead_comm(
                db, channel, name, phone,
                comment=f"Имя: {name}, тел: {phone}. Перезвонить и записать на приём",
                create_patient=False, chat_id=cid, channel_uid=str(uid),
            )
            return reply(
                f"Готово, {name}! Администратор свяжется с вами для записи по номеру "
                f"<b>{phone}</b>.",
                kb_lead_saved("book_new"),
            )
        await set_state(channel, uid, {**state, "step": "ai_lead_name", "lead_type": "book", "chat_id": cid})
        return reply("Для записи мне нужны ваши контакты.\n\nВведите ваше имя:", kb_cancel())

    if payload == "ai_manager":
        cid = str(chat_id) if chat_id else ""
        name, phone = await _get_known_contact(db, channel, uid)
        if name and phone:
            await clear_state(channel, uid)
            await _create_lead_comm(
                db, channel, name, phone,
                comment=f"Имя: {name}, тел: {phone}. Просит перезвонить менеджера",
                create_patient=False, chat_id=cid, channel_uid=str(uid),
            )
            return reply(
                f"Готово, {name}! Менеджер свяжется с вами по номеру <b>{phone}</b>.",
                kb_lead_saved("manager_new"),
            )
        await set_state(channel, uid, {**state, "step": "ai_lead_name", "lead_type": "manager", "chat_id": cid})
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
        await _update_bot_user_phone(db, channel, str(uid), phone, name)
        await _create_lead_comm(db, channel, name, phone,
                                comment=content, create_patient=False,
                                chat_id=saved_chat_id, channel_uid=str(uid))
        return reply("Спасибо! Наш администратор свяжется с вами для записи.", kb_main())

    if step == "pick_patient":
        # Ожидаем нажатие кнопки выбора; текст — повторно показываем выбор.
        cand_ids = state.get("candidates") or []
        patients = [p for p in [await _get_patient_by_id(db, pid) for pid in cand_ids] if p is not None]
        if patients:
            candidates = [(str(p.id), _patient_label(p)) for p in patients]
            return reply("Пожалуйста, выберите пациента кнопкой ниже:", kb_patient_choice(candidates))
        await clear_state(channel, uid)
        return reply("Откройте нужный раздел заново из меню.", kb_main())

    if step == "link_phone":
        phone = text.strip()
        if not phone:
            return reply("Пожалуйста, введите номер телефона:", kb_request_phone())
        after = state.get("after", "history")
        await _update_bot_user_phone(db, channel, str(uid), phone)
        patients = await _find_patients_by_phone(db, phone)
        if len(patients) == 0:
            await clear_state(channel, uid)
            return reply(
                "К сожалению, мы не нашли карту пациента с таким номером. "
                "Проверьте номер или обратитесь к администратору клиники.",
                kb_main(),
            )
        if len(patients) > 1:
            return await _present_choice(channel, uid, patients, phone, after)
        await _set_linked_patient(db, channel, uid, patients[0].id)
        return await _dispatch_after(db, channel, uid, patients[0], after)

    if step == "change_phone_new":
        new_phone = text.strip()
        if not new_phone:
            return reply("Пожалуйста, введите новый номер телефона:", kb_cancel())
        patient_id = state.get("patient_id")
        await clear_state(channel, uid)
        ok = await _apply_phone_change(db, channel, str(uid), patient_id, new_phone)
        if ok:
            return reply(
                f"Готово! Ваш номер обновлён на <b>{new_phone}</b> — "
                "изменения сохранены в клинике.",
                kb_main(),
            )
        return reply(
            "Не удалось обновить номер. Попробуйте позже или обратитесь к администратору клиники.",
            kb_main(),
        )

    if step == "review_wait":
        # Ожидаем изображение; текст вместо фото — подсказка (фото ловится в вебхуке)
        return reply(
            "Пожалуйста, пришлите скриншот отзыва изображением 📸 "
            "или вернитесь в меню.",
            kb_back_main(),
        )

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
        await _update_bot_user_phone(db, channel, str(uid), phone, name)
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
        await _update_bot_user_phone(db, channel, str(uid), phone, name)
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
        # Дополняем базу знаний описанием бонусной программы, чтобы ассистент
        # мог отвечать на вопросы о баллах, а не отправлял звонить в клинику.
        # Ставим ПЕРЕД базой знаний: длинный kb_ctx обрезается по лимиту в
        # ai_service, и добавленный в конец блок иначе терялся.
        from app.services import loyalty_service
        from app.services.pricing_context import build_price_context
        loyalty_ctx = await loyalty_service.get_ai_context(db)
        # Прайс услуг из справочников 1Denta: ассистент должен знать цены, но
        # называть пациенту только вилку/примеры (см. системный промпт).
        price_ctx = await build_price_context(db)
        full_kb = "\n\n".join(p for p in (loyalty_ctx, price_ctx, kb_ctx) if p).strip()
        r = await ai_svc.chat_with_patient(
            text,
            kb_context=full_kb,
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

        # Уведомление в колокольчик + live-событие (счётчик, браузерный пуш).
        try:
            from app.services.notifications_service import upsert_event_notification
            _label = "Telegram" if ch == "telegram" else ("Max / VK" if ch == "max" else ch)
            await upsert_event_notification(
                db,
                type="new_lead",
                title=f"Новая заявка · {_label}",
                body=(comment or "")[:300],
                link=f"/communications?comm={comm.id}",
            )
        except Exception:
            logger.warning("bot_flow: failed to create bell notification", exc_info=True)

        await realtime.publish("new_communication", {
            "id": str(comm.id), "channel": comm.channel,
            "type": comm.type, "priority": comm.priority,
            "notif_type": "new_lead",
            "title": f"Новая заявка · {'Telegram' if ch == 'telegram' else ('Max / VK' if ch == 'max' else ch)}",
            "body": (comment or "")[:300],
            "link": f"/communications?comm={comm.id}",
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


async def _update_bot_user_phone(
    db, channel: str, user_id: str, phone: str, name: str | None = None
) -> None:
    """Сохранить телефон (и имя) пользователя на BotUser.

    Телефон нужен для сопоставления напоминаний по номеру. Имя запоминаем,
    чтобы не переспрашивать контакты при повторных запросах (менеджер/запись).
    """
    try:
        from sqlalchemy import update as sa_update
        from app.models.bot_user import BotUser
        values: dict = {"phone": phone}
        if name and name.strip():
            values["name"] = name.strip()
        await db.execute(
            sa_update(BotUser)
            .where(BotUser.channel == _db_channel(channel), BotUser.user_id == user_id)
            .values(**values)
        )
        await db.commit()
    except Exception:
        logger.warning("bot_flow: could not update bot_user phone")


async def _get_known_contact(db, channel: str, uid) -> tuple[str | None, str | None]:
    """Вернуть (имя, телефон) пользователя, если они уже известны боту.

    Источник — запись BotUser (сохраняется после первого сценария записи/
    менеджера). Имя дополняем из карты пациента, если она привязана по телефону.
    Позволяет не переспрашивать контакты при повторном обращении.
    """
    try:
        from sqlalchemy import select
        from app.models.bot_user import BotUser
        row = (await db.execute(
            select(BotUser.name, BotUser.phone).where(
                BotUser.channel == _db_channel(channel), BotUser.user_id == str(uid)
            )
        )).first()
        if not row:
            return None, None
        name, phone = row[0], row[1]
        if phone and not name:
            patient = await _find_patient_by_phone(db, phone)
            if patient is not None and patient.name:
                name = patient.name
        return (name or None), (phone or None)
    except Exception:
        logger.warning("bot_flow: get_known_contact failed")
        return None, None


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


def _db_channel(channel: str) -> str:
    """BotUser/Communication хранят канал как 'telegram', а движок использует 'tg'."""
    return "telegram" if channel == "tg" else channel


async def _find_patient_by_phone(db, phone: str):
    """Найти пациента по телефону.

    Сравнение по последним 10 цифрам с нормализацией **обеих** сторон: в базе
    номер может храниться с форматированием (+7(927)012-07-77), а Telegram/Max
    присылают только цифры (79270120777).
    """
    try:
        from sqlalchemy import func, select
        from app.models.patient import Patient
        # Точное совпадение (быстрый путь)
        row = (await db.execute(
            select(Patient).where(Patient.phone == phone).limit(1)
        )).scalars().first()
        if row is not None:
            return row
        # Нормализованное совпадение по последним 10 цифрам.
        # regexp_replace убирает из сохранённого номера всё, кроме цифр.
        digits = "".join(c for c in phone if c.isdigit())[-10:]
        if len(digits) == 10:
            normalized = func.right(
                func.regexp_replace(Patient.phone, r"[^0-9]", "", "g"), 10
            )
            candidates = (await db.execute(
                select(Patient).where(normalized == digits).limit(1)
            )).scalars().first()
            return candidates
    except Exception:
        logger.warning("bot_flow: patient lookup by phone failed")
    return None


async def _resolve_patient(db, channel: str, uid):
    """Найти пациента, связанного с этим пользователем бота.

    Приоритет — явно выбранная карта (BotUser.patient_id, когда по номеру было
    несколько пациентов). Иначе ищем по сохранённому телефону.
    """
    try:
        linked = await _linked_patient(db, channel, uid)
        if linked is not None:
            return linked
        from sqlalchemy import select
        from app.models.bot_user import BotUser
        phone = (await db.execute(
            select(BotUser.phone).where(
                BotUser.channel == _db_channel(channel), BotUser.user_id == str(uid)
            )
        )).scalar_one_or_none()
        if not phone:
            return None
        return await _find_patient_by_phone(db, phone)
    except Exception:
        logger.warning("bot_flow: resolve_patient failed")
        return None


async def _find_patients_by_phone(db, phone: str) -> list:
    """Все пациенты с этим номером (телефон или телефон представителя).

    По одному номеру может быть несколько карт: родитель и ребёнок, номер
    друга. Нормализуем по последним 10 цифрам. Возвращаем список без дублей.
    """
    try:
        from sqlalchemy import func, or_, select
        from app.models.patient import Patient

        digits = "".join(c for c in phone if c.isdigit())[-10:]
        if len(digits) < 10:
            # Слишком короткий номер — только точное совпадение.
            rows = (await db.execute(
                select(Patient).where(Patient.phone == phone)
            )).scalars().all()
            return list(rows)

        norm_phone = func.right(func.regexp_replace(Patient.phone, r"[^0-9]", "", "g"), 10)
        norm_rep = func.right(
            func.regexp_replace(func.coalesce(Patient.representative_phone, ""), r"[^0-9]", "", "g"), 10
        )
        rows = (await db.execute(
            select(Patient)
            .where(or_(norm_phone == digits, norm_rep == digits))
            .order_by(Patient.created_at)
        )).scalars().all()
        # Дедуп по id (на случай совпадения обоих условий).
        seen: set = set()
        result = []
        for p in rows:
            if p.id not in seen:
                seen.add(p.id)
                result.append(p)
        return result
    except Exception:
        logger.warning("bot_flow: find_patients_by_phone failed", exc_info=True)
        # Фоллбэк на одиночный поиск.
        one = await _find_patient_by_phone(db, phone)
        return [one] if one is not None else []


async def _get_patient_by_id(db, patient_id: str):
    try:
        import uuid as _uuid
        from app.models.patient import Patient
        return await db.get(Patient, _uuid.UUID(str(patient_id)))
    except Exception:
        return None


async def _linked_patient(db, channel: str, uid):
    """Пациент, явно привязанный к пользователю бота (BotUser.patient_id)."""
    try:
        from sqlalchemy import select
        from app.models.bot_user import BotUser
        pid = (await db.execute(
            select(BotUser.patient_id).where(
                BotUser.channel == _db_channel(channel), BotUser.user_id == str(uid)
            )
        )).scalar_one_or_none()
        if not pid:
            return None
        from app.models.patient import Patient
        return await db.get(Patient, pid)
    except Exception:
        return None


async def _stored_phone(db, channel: str, uid) -> str | None:
    try:
        from sqlalchemy import select
        from app.models.bot_user import BotUser
        return (await db.execute(
            select(BotUser.phone).where(
                BotUser.channel == _db_channel(channel), BotUser.user_id == str(uid)
            )
        )).scalar_one_or_none()
    except Exception:
        return None


async def _set_linked_patient(db, channel: str, uid, patient_id) -> None:
    try:
        from sqlalchemy import update as sa_update
        from app.models.bot_user import BotUser
        await db.execute(
            sa_update(BotUser)
            .where(BotUser.channel == _db_channel(channel), BotUser.user_id == str(uid))
            .values(patient_id=patient_id)
        )
        await db.commit()
    except Exception:
        logger.warning("bot_flow: could not set linked patient")


def _patient_label(patient) -> str:
    """Подпись пациента на кнопке выбора: имя + год рождения (если есть)."""
    name = (patient.name or "Пациент").strip()
    bd = getattr(patient, "birth_date", None)
    if bd:
        return f"{name} ({bd.strftime('%d.%m.%Y')})"[:40]
    return name[:40]


async def _resolve_and_dispatch(db, channel: str, uid, after: str, ask_text: str) -> dict:
    """Найти пациента для действия (history/bonus/change_phone) и продолжить.

    Если карта одна — сразу продолжаем; если несколько — показываем выбор;
    если неизвестна — просим номер телефона.
    """
    patient = await _linked_patient(db, channel, uid)
    if patient is not None:
        return await _dispatch_after(db, channel, uid, patient, after)

    phone = await _stored_phone(db, channel, uid)
    if phone:
        patients = await _find_patients_by_phone(db, phone)
        if len(patients) == 1:
            await _set_linked_patient(db, channel, uid, patients[0].id)
            return await _dispatch_after(db, channel, uid, patients[0], after)
        if len(patients) > 1:
            return await _present_choice(channel, uid, patients, phone, after)

    await set_state(channel, uid, {"step": "link_phone", "after": after})
    return reply(ask_text, kb_request_phone())


async def _present_choice(channel: str, uid, patients: list, phone: str, after: str) -> dict:
    """Показать выбор пациента (несколько карт по одному номеру)."""
    candidates = [(str(p.id), _patient_label(p)) for p in patients[:8]]
    await set_state(channel, uid, {
        "step": "pick_patient",
        "after": after,
        "phone": phone,
        "candidates": [c[0] for c in candidates],
    })
    return reply(
        "По этому номеру найдено несколько пациентов. Уточните, кто именно "
        "имеется в виду:",
        kb_patient_choice(candidates),
    )


async def _dispatch_after(db, channel: str, uid, patient, after: str) -> dict:
    """Продолжить действие после того, как пациент определён."""
    await clear_state(channel, uid)
    if after == "bonus":
        return reply(await _format_bonus(db, patient), kb_bonus())
    if after == "change_phone":
        await set_state(channel, uid, {"step": "change_phone_new", "patient_id": str(patient.id)})
        return reply(
            f"{patient.name}, введите новый номер телефона — обновим его "
            "в клинике:",
            kb_cancel(),
        )
    return reply(await _format_history(db, patient), kb_history())


async def _apply_phone_change(db, channel: str, uid, patient_id, new_phone: str) -> bool:
    """Изменить номер пациента: в DentaFlow, у пользователя бота и в 1Denta."""
    try:
        from app.models.patient import Patient
        patient = await _get_patient_by_id(db, patient_id) if patient_id else None
        if patient is None:
            patient = await _linked_patient(db, channel, uid)
        if patient is None:
            return False

        patient.phone = new_phone
        await db.commit()

        # Обновляем сохранённый телефон пользователя бота (связь сохраняем).
        await _update_bot_user_phone(db, channel, str(uid), new_phone)

        # Синхронизируем с 1Denta, если карта заведена там.
        if patient.external_id:
            try:
                from app.services.one_denta import OneDentaService
                svc = await OneDentaService.from_db(db)
                normalized = OneDentaService.normalize_phone(new_phone)
                await svc.update_client(patient.external_id, phone=normalized)
            except Exception:
                logger.warning("bot_flow: 1Denta phone sync failed", exc_info=True)
                # Локально номер уже изменён — считаем операцию успешной.
        return True
    except Exception:
        logger.exception("bot_flow: apply_phone_change failed")
        return False


async def _notify_bad_phone(db, channel: str, phone: str, candidate_ids: list) -> None:
    """Уведомить администратора, что номер, возможно, попал в базу по ошибке."""
    try:
        from app.services.notifications_service import upsert_event_notification

        names = []
        for pid in (candidate_ids or [])[:8]:
            p = await _get_patient_by_id(db, pid)
            if p is not None:
                names.append(p.name or "без имени")
        who = ", ".join(names) if names else "—"
        _label = "Telegram" if _db_channel(channel) == "telegram" else "Max / VK"
        await upsert_event_notification(
            db,
            type="bad_phone",
            title="Проверьте номер пациента",
            body=(
                f"Пользователь {_label} указал, что по номеру {phone or '—'} "
                f"нет его карты. Совпавшие карты: {who}. Возможно, номер "
                "некорректен или попал в базу по ошибке."
            )[:300],
            link=f"/patients?phone={phone}",
        )
    except Exception:
        logger.warning("bot_flow: failed to create bad-phone notification", exc_info=True)


def _fmt_money(value) -> str:
    try:
        return f"{float(value):,.0f}".replace(",", " ")
    except (TypeError, ValueError):
        return "0"


async def _format_history(db, patient) -> str:
    """Текст истории визитов и оплат пациента (последние визиты)."""
    from sqlalchemy import select
    from app.models.appointment import Appointment

    rows = (await db.execute(
        select(Appointment)
        .where(Appointment.patient_id == patient.id)
        .order_by(Appointment.scheduled_at.desc())
        .limit(10)
    )).scalars().all()

    if not rows:
        return (
            "📋 <b>История визитов</b>\n\n"
            "Пока у нас нет данных о ваших визитах. "
            "Они появятся здесь после приёма."
        )

    _STATUS = {
        "completed": "✅ завершён",
        "confirmed": "🟢 подтверждён",
        "scheduled": "🕒 запланирован",
        "cancelled": "❌ отменён",
        "no_show": "⚠️ неявка",
    }
    lines = ["📋 <b>История визитов и оплат</b>\n"]
    for a in rows:
        when = a.scheduled_at.strftime("%d.%m.%Y") if a.scheduled_at else "—"
        parts = [f"<b>{when}</b>"]
        if a.service:
            parts.append(a.service)
        if a.doctor_name:
            parts.append(f"врач: {a.doctor_name}")
        line = " · ".join(parts)
        status = _STATUS.get((a.status or "").lower())
        if status:
            line += f"\n   {status}"
        pay = a.payment_amount if a.payment_amount is not None else a.revenue
        if pay is not None and float(pay) > 0:
            line += f"\n   💰 оплата: {_fmt_money(pay)} ₽"
        lines.append(line)

    total = patient.total_revenue
    if total is not None and float(total) > 0:
        lines.append(f"\n<b>Всего оплачено: {_fmt_money(total)} ₽</b>")
    return "\n\n".join(lines)


async def _format_bonus(db, patient) -> str:
    """Текст раздела бонусной программы: баланс, правила начисления, код, история."""
    from app.services import loyalty_service

    config = await loyalty_service.get_config(db)
    code = await loyalty_service.get_or_create_referral_code(db, patient.id)
    balance = int(patient.bonus_balance or 0)
    ledger = await loyalty_service.get_patient_ledger(db, patient.id, limit=5)

    _ACTION = {
        "purchase": "покупка",
        "referral": "рекомендация",
        "review": "отзыв",
        "manual": "корректировка",
    }
    balance_word = loyalty_service._points_word(balance)
    lines = [
        "🎁 <b>Бонусная программа</b>\n",
        f"💎 Ваш баланс: <b>{balance}</b> {balance_word}\n",
    ]

    # Правила начисления баллов из настроек «Начисление баллов».
    rules = loyalty_service.describe_earning_rules(config)
    if rules:
        lines.append("<b>Как копятся баллы:</b>")
        lines.extend(rules)
        lines.append("")

    lines += [
        f"🔑 Ваш реферальный код: <b>{code or '—'}</b>",
        "Поделитесь им с друзьями — назовите код администратору, "
        "и вы получите баллы за рекомендацию.\n",
        "📸 Оставили отзыв о клинике? Нажмите «Отправить скриншот отзыва» — "
        "после проверки мы начислим баллы.",
    ]
    if ledger:
        hist = ["\n<b>Последние начисления:</b>"]
        for t in ledger:
            when = t.created_at.strftime("%d.%m.%Y") if t.created_at else ""
            sign = "+" if t.points >= 0 else ""
            label = _ACTION.get(t.action_type, t.action_type)
            hist.append(f"{when} · {label}: {sign}{t.points}")
        lines.append("\n".join(hist))
    return "\n".join(lines)


def _welcome(welcome_message: str, clinic_name: str) -> str:
    if welcome_message and welcome_message.strip():
        return welcome_message.strip()
    name = clinic_name or "нашу клинику"
    return (
        f"👋 Добро пожаловать в {name}!\n\n"
        "Я — ваш умный ассистент. Со мной вы можете:\n\n"
        "📅 <b>Записаться на приём</b> — оставьте заявку, и администратор "
        "подберёт удобное время.\n"
        "💬 <b>Задать вопрос</b> — расскажу об услугах, ценах и подготовке к приёму.\n"
        "📋 <b>Мои визиты и оплаты</b> — история приёмов и платежей по вашему номеру.\n"
        "🎁 <b>Бонусная программа</b> — баланс баллов, реферальный код и баллы за отзыв.\n"
        "📞 <b>Связаться с менеджером</b> — закажите обратный звонок.\n\n"
        "Нажмите «ℹ️ Помощь», чтобы узнать подробнее, или выберите действие ниже 👇"
    )


def _help_text(clinic_name: str) -> str:
    """Подробный раздел «Помощь» — описание всех возможностей бота."""
    # Название клиники подставляется как самостоятельное подлежащее (именительный
    # падеж), чтобы корректно читалось при любом введённом названии, например
    # «Клиника доктора Ешидоржиева на связи…», а не «Я ассистент Клиника…».
    name = clinic_name or "Клиника"
    return (
        "ℹ️ <b>Помощь — что умеет бот</b>\n\n"
        f"{name} на связи круглосуточно. Я — ваш виртуальный ассистент, "
        "и вот все разделы меню:\n\n"
        "📅 <b>Записаться на приём</b>\n"
        "Оставьте имя и номер телефона — по желанию опишите проблему. "
        "Администратор свяжется с вами и подберёт удобное время.\n\n"
        "💬 <b>Задать вопрос</b>\n"
        "Спросите что угодно об услугах, ценах, врачах или подготовке к приёму — "
        "я отвечу на основе базы знаний клиники. Прямо из чата можно записаться "
        "или позвать менеджера.\n\n"
        "📋 <b>Мои визиты и оплаты</b>\n"
        "Покажу историю ваших приёмов, статусы записей и суммы оплат. "
        "Для этого один раз укажите номер телефона, по которому вы записаны в клинике "
        "(или поделитесь контактом кнопкой).\n\n"
        "🎁 <b>Бонусная программа</b>\n"
        "Проверьте баланс баллов и ваш персональный реферальный код — "
        "поделитесь им с друзьями и получайте баллы за рекомендации. "
        "А ещё можно прислать скриншот отзыва о клинике и получить за него баллы.\n\n"
        "📞 <b>Связаться с менеджером</b>\n"
        "Оставьте контакты — и наш администратор перезвонит вам в ближайшее время.\n\n"
        "💡 Подсказки:\n"
        "• В любой момент напишите «меню» или нажмите «🔙 Главное меню», "
        "чтобы вернуться назад.\n"
        "• Можно просто написать вопрос обычным сообщением — я пойму и помогу.\n\n"
        "Выберите нужный раздел ниже 👇"
    )
