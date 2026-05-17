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

async def load_services(db: AsyncSession, page: int = 0, per_page: int = 10) -> tuple[list[dict], bool]:
    """Return paginated services from directory cache. Returns (services, has_more)."""
    try:
        from sqlalchemy import select, func as sqlfunc
        from app.models.directory_cache import DirectoryCache
        offset = page * per_page
        stmt = (
            select(DirectoryCache)
            .where(DirectoryCache.category == "service")
            .order_by(DirectoryCache.name)
            .offset(offset)
            .limit(per_page + 1)
        )
        rows = (await db.execute(stmt)).scalars().all()
        has_more = len(rows) > per_page
        return (
            [{"id": r.external_id or str(i + offset), "name": r.name} for i, r in enumerate(rows[:per_page])],
            has_more,
        )
    except Exception:
        logger.exception("bot_flow: failed to load services")
        return [], False


async def load_slots(service_id: str, date_str: str) -> list[dict]:
    """Return available time slots, cached in Redis for 10 minutes."""
    cache_key = f"slots:{service_id}:{date_str}"
    try:
        rc = _rc()
        cached = await rc.get(cache_key)
        if cached:
            logger.info("bot_flow: slots cache hit for %s", cache_key)
            return json.loads(cached)
    except Exception:
        pass  # Redis unavailable — proceed to live fetch

    try:
        from app.services.one_denta import OneDentaService
        od = OneDentaService()
        resources = await od.get_resources() or []
        svc_ids = [service_id] if service_id else ["1"]
        slots: list[dict] = []
        for res in resources:
            rid = str(res.get("external_id") or res.get("id") or "")
            doc = res.get("name", "Врач")
            if not rid:
                continue
            times = await od.get_available_slots(rid, svc_ids, date_str)
            for t in times or []:
                dt_str = str(t)
                time_part = dt_str[11:16] if len(dt_str) > 10 else dt_str
                slots.append({"dt": dt_str, "time": time_part, "doctor": doc, "doctor_id": rid})
        slots.sort(key=lambda s: s["dt"])
        slots = slots[:15]

        try:
            await _rc().setex(cache_key, 600, json.dumps(slots, ensure_ascii=False))  # 10 min TTL
        except Exception:
            pass

        return slots
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


def kb_services(services: list[dict], page: int = 0, has_more: bool = False) -> dict:
    tg_rows = [[_tg_btn(s["name"][:40], f"svc:{page}:{i}")] for i, s in enumerate(services)]
    nav: list = []
    if page > 0:
        nav.append(_tg_btn("◀️ Назад", f"svc_page:{page - 1}"))
    if has_more:
        nav.append(_tg_btn("Ещё ▶️", f"svc_page:{page + 1}"))
    if nav:
        tg_rows.append(nav)
    tg_rows.append([_tg_btn("🔙 Главное меню", "menu")])

    max_rows = [[_max_btn(s["name"][:40], f"svc:{page}:{i}")] for i, s in enumerate(services)]
    max_nav: list = []
    if page > 0:
        max_nav.append(_max_btn("◀️ Назад", f"svc_page:{page - 1}"))
    if has_more:
        max_nav.append(_max_btn("Ещё ▶️", f"svc_page:{page + 1}"))
    if max_nav:
        max_rows.append(max_nav)
    max_rows.append([_max_btn("🔙 Главное меню", "menu")])
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

    if payload == "book" or payload.startswith("svc_page:"):
        page = 0
        if payload.startswith("svc_page:"):
            try:
                page = int(payload.split(":")[1])
            except (IndexError, ValueError):
                page = 0
        services, has_more = await load_services(db, page=page)
        if not services and page == 0:
            # 1Denta not configured — fall back to AI booking intent
            await set_state(channel, uid, {**state, "step": "ai_chat"})
            r = await ai_svc.chat_with_patient(
                "Пациент хочет записаться на приём. Помоги ему.",
                kb_context=kb_ctx, system_prompt=system_prompt,
            )
            return reply(r, kb_back_main())
        await set_state(channel, uid, {"step": "bk_svc", "svc_page": page, "services": services})
        return reply("Выберите услугу:", kb_services(services, page=page, has_more=has_more))

    if payload == "ask":
        await set_state(channel, uid, {**state, "step": "ai_chat"})
        return reply("💬 Задайте ваш вопрос — я постараюсь помочь!", kb_back_main())

    if payload.startswith("svc:"):
        # format: svc:{page}:{index}
        parts = payload.split(":")
        try:
            idx = int(parts[2]) if len(parts) == 3 else int(parts[1])
        except (IndexError, ValueError):
            return reply("Услуга не найдена. Попробуйте снова.", kb_main())
        services = state.get("services", [])
        try:
            svc = services[idx]
        except IndexError:
            return reply("Услуга не найдена. Попробуйте снова.", kb_main())
        await set_state(channel, uid, {**state, "step": "bk_date",
                                       "service_id": svc["id"], "service_name": svc["name"]})
        return reply(
            f"Вы выбрали: {svc['name']}\n\nВыберите удобную дату:",
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
        await set_state(channel, uid, {**state, "step": "bk_name", "slot_idx": idx})
        return reply(
            f"Отлично! Вы выбрали:\n"
            f"🦷 {state.get('service_name', '')}\n"
            f"📅 {state.get('date', '')}, {slot['time']}\n"
            f"👨‍⚕️ {slot['doctor']}\n\n"
            "Для записи введите ваше имя:",
            kb_cancel(),
        )

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
        reminder_id = payload.split(":", 1)[1]
        return await _do_cancel_appt(db, channel, uid, reminder_id)

    if payload.startswith("reschedule:"):
        reminder_id = payload.split(":", 1)[1]
        return await _do_reschedule_start(db, channel, uid, state, reminder_id)

    if payload == "confirm":
        return await _do_confirm(state, channel, uid, clinic_name, db, chat_id=uid)

    if payload == "back":
        return await _do_back(state, channel, uid)

    # ── Text messages ─────────────────────────────────────────────────

    if step == "bk_name":
        name = text.strip()
        if not name:
            return reply("Пожалуйста, введите ваше имя:", kb_cancel())
        await set_state(channel, uid, {**state, "step": "bk_phone", "contact_name": name})
        return reply(f"Спасибо, {name}! Введите ваш номер телефона:", kb_cancel())

    if step == "bk_phone":
        phone = text.strip()
        if not phone:
            return reply("Пожалуйста, введите номер телефона:", kb_cancel())
        slots = state.get("slots", [])
        slot_idx = state.get("slot_idx", 0)
        slot = slots[slot_idx] if slot_idx < len(slots) else {}
        await set_state(channel, uid, {**state, "step": "bk_conf", "contact_phone": phone})
        return reply(
            f"Подтвердите запись:\n\n"
            f"👤 {state.get('contact_name', '')}, {phone}\n"
            f"🦷 {state.get('service_name', '')}\n"
            f"📅 {state.get('date', '')}, {slot.get('time', '')}\n"
            f"👨‍⚕️ {slot.get('doctor', '')}",
            kb_confirm(),
        )

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
            await set_state(channel, uid, {**state, "step": "ai_lead_name", "lead_type": "book"})
            return reply(
                "Конечно, помогу записаться! Для этого мне нужны ваши контакты.\n\nВведите ваше имя:",
                kb_cancel(),
            )
        if intent == "manager":
            await set_state(channel, uid, {**state, "step": "ai_lead_name", "lead_type": "manager"})
            return reply(
                "Хорошо, передам менеджеру! Введите ваше имя:",
                kb_cancel(),
            )
        r = await ai_svc.chat_with_patient(text, kb_context=kb_ctx, system_prompt=system_prompt)
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

async def _do_confirm(state: dict, channel: str, uid, clinic_name: str, db, chat_id=None) -> dict:
    slots: list[dict] = state.get("slots", [])
    slot_idx: int = state.get("slot_idx", 0)
    slot = slots[slot_idx] if slot_idx < len(slots) else {}
    service_id = state.get("service_id", "")
    service_name = state.get("service_name", "")
    date_str = state.get("date", "")
    name = state.get("contact_name", "")
    phone = state.get("contact_phone", "")
    doctor_id = slot.get("doctor_id", "")
    dt_raw = slot.get("dt", "")

    # Create or find patient
    patient_id = None
    try:
        from sqlalchemy import select
        from app.models.patient import Patient
        if phone:
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
    except Exception:
        logger.exception("bot_flow: failed to create patient")

    # Book in 1Denta
    booked = False
    visit_id: str | None = None
    try:
        from app.services.one_denta import OneDentaService
        if doctor_id and dt_raw:
            od = OneDentaService()
            visit_data = await od.create_visit(
                name=name or "Пациент из бота",
                phone=phone,
                email="",
                service_ids=[service_id] if service_id else [],
                resource_id=doctor_id,
                dt=dt_raw,
                comment=f"Запись через бот ({channel})",
            )
            visit_id = str(visit_data.get("id") or visit_data.get("visitId") or "")
            booked = True
    except Exception:
        logger.exception("bot_flow: create_visit failed")

    # Create communication
    try:
        from app.models.communication import Communication
        from app.services.realtime import realtime
        ch = channel if channel != "tg" else "telegram"
        comm = Communication(
            patient_id=patient_id,
            channel=ch,
            direction="inbound",
            type="message",
            content=(
                f"Запись через бот: {service_name}, {date_str} {slot.get('time', '')}, "
                f"врач: {slot.get('doctor', '')}. Имя: {name}, тел: {phone}"
            ),
            status="new",
            priority="high",
        )
        db.add(comm)
        await db.flush()
        await realtime.publish("new_communication", {
            "id": str(comm.id), "channel": comm.channel,
            "type": comm.type, "priority": comm.priority,
        })
    except Exception:
        logger.exception("bot_flow: failed to create communication")

    # Save reminder for 24h notification
    try:
        from datetime import datetime as dt_cls, timezone
        from app.models.bot_reminder import BotReminder
        if dt_raw:
            scheduled = dt_cls.fromisoformat(dt_raw)
            if scheduled.tzinfo is None:
                scheduled = scheduled.replace(tzinfo=timezone.utc)
            reminder = BotReminder(
                channel=channel if channel != "tg" else "telegram",
                chat_id=str(chat_id or uid),
                user_id=str(uid),
                patient_name=name,
                patient_phone=phone,
                service_name=service_name,
                doctor_name=slot.get("doctor", ""),
                scheduled_at=scheduled,
                one_denta_visit_id=visit_id,
                service_id=service_id,
                doctor_id=doctor_id,
            )
            db.add(reminder)
    except Exception:
        logger.exception("bot_flow: failed to save reminder")

    await db.commit()
    await clear_state(channel, uid)

    if booked:
        text = (
            f"Запись подтверждена!\n\n"
            f"🦷 {service_name}\n"
            f"📅 {date_str}, {slot.get('time', '')}\n"
            f"👨‍⚕️ {slot.get('doctor', '')}\n\n"
            "Мы пришлём напоминание за сутки до визита."
        )
    else:
        text = (
            f"Заявка принята!\n\n"
            f"🦷 {service_name}\n"
            f"📅 {date_str}, {slot.get('time', '')}\n"
            f"👨‍⚕️ {slot.get('doctor', '')}\n\n"
            "Администратор свяжется с вами для подтверждения записи."
        )
    return reply(text, kb_main())


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
            content=f"Имя: {name}, тел: {phone}. {comment}",
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


async def _do_back(state: dict, channel: str, uid) -> dict:
    step = state.get("step", "")
    if step == "bk_date":
        services = state.get("services", [])
        page = state.get("svc_page", 0)
        return reply("Выберите услугу:", kb_services(services, page=page, has_more=False))
    if step == "bk_slot":
        return reply("Выберите удобную дату:", kb_dates())
    if step == "bk_conf":
        slots = state.get("slots", [])
        return reply("Выберите удобное время:", kb_slots(slots))
    await clear_state(channel, uid)
    return reply("Главное меню:", kb_main())


async def _do_cancel_appt(db, channel: str, uid, reminder_id: str) -> dict:
    try:
        from sqlalchemy import select
        from app.models.bot_reminder import BotReminder
        stmt = select(BotReminder).where(BotReminder.id == reminder_id)
        reminder = (await db.execute(stmt)).scalar_one_or_none()
        if not reminder or reminder.cancelled:
            return reply("Запись уже отменена или не найдена.", kb_main())

        if reminder.one_denta_visit_id:
            try:
                from app.services.one_denta import OneDentaService
                od = OneDentaService()
                await od.delete_visit(reminder.one_denta_visit_id)
            except Exception:
                logger.exception("bot_flow: failed to delete 1Denta visit")

        reminder.cancelled = True
        await db.commit()
    except Exception:
        logger.exception("bot_flow: cancel_appt failed")

    return reply(
        "Ваша запись отменена. Если хотите записаться снова — нажмите «Записаться на приём».",
        kb_main(),
    )


async def _do_reschedule_start(db, channel: str, uid, state: dict, reminder_id: str) -> dict:
    try:
        from sqlalchemy import select
        from app.models.bot_reminder import BotReminder
        stmt = select(BotReminder).where(BotReminder.id == reminder_id)
        reminder = (await db.execute(stmt)).scalar_one_or_none()
        if not reminder or reminder.cancelled:
            return reply("Запись не найдена или уже отменена.", kb_main())

        # Cancel old visit, then start new booking for same service
        if reminder.one_denta_visit_id:
            try:
                from app.services.one_denta import OneDentaService
                od = OneDentaService()
                await od.delete_visit(reminder.one_denta_visit_id)
            except Exception:
                logger.exception("bot_flow: reschedule delete_visit failed")

        reminder.cancelled = True
        await db.commit()

        # Pre-fill state with previous service so user picks new date only
        await set_state(channel, uid, {
            "step": "bk_date",
            "service_id": reminder.service_id or "",
            "service_name": reminder.service_name or "",
            "contact_name": reminder.patient_name or "",
            "contact_phone": reminder.patient_phone or "",
            "services": [],
            "svc_page": 0,
        })
        return reply(
            f"Старая запись отменена. Выберите новую дату для «{reminder.service_name}»:",
            kb_dates(),
        )
    except Exception:
        logger.exception("bot_flow: reschedule_start failed")
        return reply("Не удалось перенести запись. Попробуйте снова.", kb_main())


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
