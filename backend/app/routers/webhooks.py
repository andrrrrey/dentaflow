"""Webhook endpoints for external integrations.

All endpoints live under ``/api/v1/webhooks`` and do **not** require the
standard JWT auth — they validate requests using channel-specific webhook
secrets instead.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.sql import func

from app.config import settings
from app.database import get_db
from app.models.communication import Communication
from app.models.patient import Patient
from app.models.task import Task
from app.services.novofon import NovofonService
from app.services.telegram_bot import TelegramBotService
from app.services.max_vk import MaxVkService
from app.services.realtime import realtime
from app.services.integrations_service import get_raw_value
from app.services.ai_service import AIService
from app.services.bot_flow import process as bot_process
from app.routers.knowledge_base import get_kb_context

# Communication records are created inside bot_flow when user provides contacts,
# not on every incoming message.

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

# Service singletons (stateless, cheap to create)
_novofon = NovofonService()
# TelegramBotService and MaxVkService are created per-request to pick up latest db tokens
_max_vk = MaxVkService()

# Set bot commands once per process
_tg_commands_registered = False


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


async def _upsert_bot_user(db, channel: str, chat_id: str, user_id: str, phone: str | None = None) -> None:
    """Insert or update BotUser record (used for appointment reminders)."""
    try:
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        from app.models.bot_user import BotUser
        values: dict = {"id": __import__("uuid").uuid4(), "channel": channel, "chat_id": chat_id, "user_id": user_id}
        if phone:
            values["phone"] = phone
        set_dict: dict = {"last_seen_at": func.now()}
        if phone:
            set_dict["phone"] = phone
        stmt = pg_insert(BotUser).values(**values).on_conflict_do_update(
            index_elements=["channel", "user_id"],
            set_=set_dict,
        )
        await db.execute(stmt)
        await db.commit()
    except Exception:
        logger.exception("_upsert_bot_user failed for %s:%s", channel, user_id)


# ------------------------------------------------------------------
# Novofon (telephony)
# ------------------------------------------------------------------

def _parse_novofon_notification(body: dict) -> dict:
    """Map Novofon notification fields to our internal call-event format.

    Novofon sends three notification types with different payload shapes:
    - Входящий вызов: call_session_id at top level, no duration fields
    - Завершённый вызов: call_session_id inside call_info, talk_time_duration inside call_info
    - Потерянный вызов: call_session_id at top level, wait_time_duration at top level
    """
    if "caller_id" in body or "event" in body:
        return body  # already in our internal format

    contact_info = body.get("contact_info") or {}
    call_info = body.get("call_info") or {}

    # call_session_id is at top level for Входящий/Потерянный,
    # but nested inside call_info for Завершённый
    call_id = str(
        body.get("call_session_id")
        or call_info.get("call_session_id")
        or body.get("external_id")
        or contact_info.get("communication_number")
        or ""
    )

    # talk_time_duration > 0 means someone actually talked → answered call
    # This field only appears in "Завершённый вызов" notifications
    talk_duration = int(call_info.get("talk_time_duration") or 0)
    wait_duration = int(call_info.get("wait_time_duration") or body.get("wait_time_duration") or 0)

    notification_name = body.get("notification_name", "").lower()

    if talk_duration > 0:
        event = "notify_end"  # answered: talk_time_duration > 0 is the definitive signal
    elif call_info:
        # call_info is present → this is a "Завершённый" notification even if talk_duration=0
        event = "notify_end"
    elif "завершён" in notification_name or "end" in notification_name or "answered" in notification_name:
        event = "notify_end"
    elif "потерян" in notification_name or "missed" in notification_name or "lost" in notification_name:
        event = "missed"
    elif "вход" in notification_name or "start" in notification_name or "incoming" in notification_name:
        event = "notify_start"
    else:
        event = "missed"

    caller_id = contact_info.get("contact_phone_number", "") or body.get("contact_phone_number", "")

    logger.debug(
        "Novofon parsed: event=%s call_id=%s caller=%s talk_dur=%s notification=%r",
        event, call_id, caller_id, talk_duration, body.get("notification_name", ""),
    )

    return {
        "event": event,
        "caller_id": caller_id,
        "called_did": body.get("virtual_phone_number", ""),
        "call_id": call_id,
        "duration": talk_duration or wait_duration,
        "direction": "inbound",
    }


@router.post("/novofon")
async def novofon_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle an incoming Novofon call event (webhook or HTTP notification)."""
    raw = await request.body()
    content_type = request.headers.get("content-type", "")

    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        from urllib.parse import parse_qs
        try:
            parsed = parse_qs(raw, encoding="utf-8", keep_blank_values=True)
            body: dict = {
                (k.decode() if isinstance(k, bytes) else k): (v[0].decode() if isinstance(v[0], bytes) else v[0])
                for k, v in parsed.items() if v
            }
        except Exception:
            form = await request.form()
            body = dict(form)
    else:
        import json as _json
        try:
            body = _json.loads(raw) if raw else {}
        except Exception:
            body = {}

    body = _parse_novofon_notification(body)

    result = await _novofon.handle_call_event(body)

    patient_id = None
    phone = result.get("phone")
    if phone:
        stmt = select(Patient).where(Patient.phone == phone).limit(1)
        row = await db.execute(stmt)
        patient = row.scalar_one_or_none()
        if patient:
            patient_id = patient.id

    # Deduplication: Novofon sends several notifications per call (incoming /
    # completed / missed) that all share the same call_session_id. Keep exactly one
    # Communication per session and merge later notifications into it, so the call
    # history matches the Novofon report (one row per call session).
    external_id = result.get("external_id")
    if external_id:
        existing_stmt = (
            select(Communication)
            .where(
                Communication.channel == "novofon",
                Communication.external_id == external_id,
            )
            .limit(1)
        )
        existing_row = await db.execute(existing_stmt)
        existing_comm = existing_row.scalar_one_or_none()
        if existing_comm:
            new_duration = result.get("duration_sec") or 0
            # A call counts as answered only when a leg was actually picked up
            # (an answered notification carrying talk time > 0).
            new_answered = result["type"] == "call" and new_duration > 0
            existing_answered = existing_comm.type == "call" and (existing_comm.duration_sec or 0) > 0

            existing_comm.duration_sec = max(existing_comm.duration_sec or 0, new_duration)
            if new_answered:
                existing_comm.type = "call"
                existing_comm.priority = "normal"
            elif not existing_answered:
                # Not yet answered — let the latest non-answered signal (e.g. missed) stand.
                existing_comm.type = result["type"]
                existing_comm.priority = result["priority"]
            if result.get("content") and existing_comm.content in (None, "", "{}"):
                existing_comm.content = result.get("content")

            # Ensure a callback task exists for calls that ended up missed, without
            # duplicating one across the several notifications of the same session.
            if existing_comm.type == "missed_call" and result.get("create_callback_task"):
                task_exists = await db.execute(
                    select(Task.id).where(Task.comm_id == existing_comm.id).limit(1)
                )
                if task_exists.scalar_one_or_none() is None:
                    db.add(Task(
                        patient_id=patient_id,
                        comm_id=existing_comm.id,
                        type="callback",
                        title=f"Перезвонить: {phone or 'неизвестный номер'}",
                    ))

            await db.commit()
            await realtime.publish("new_communication", {
                "id": str(existing_comm.id),
                "channel": existing_comm.channel,
                "type": existing_comm.type,
                "priority": existing_comm.priority,
            })
            logger.info("Novofon: merged notification into comm_id=%s call_id=%s type=%s", existing_comm.id, external_id, existing_comm.type)
            return {"status": "ok", "communication_id": str(existing_comm.id)}

    comm = Communication(
        patient_id=patient_id,
        channel=result["channel"],
        direction=result["direction"],
        type=result["type"],
        content=result.get("content"),
        duration_sec=result.get("duration_sec"),
        status=result["status"],
        priority=result["priority"],
        external_id=external_id,
    )
    db.add(comm)
    await db.flush()

    if result.get("create_callback_task"):
        task = Task(
            patient_id=patient_id,
            comm_id=comm.id,
            type="callback",
            title=f"Перезвонить: {phone or 'неизвестный номер'}",
        )
        db.add(task)

    await db.commit()

    await realtime.publish("new_communication", {
        "id": str(comm.id),
        "channel": comm.channel,
        "type": comm.type,
        "priority": comm.priority,
    })

    from app.services.deals_service import maybe_create_auto_lead
    await maybe_create_auto_lead(
        channel="novofon",
        patient_id=patient_id,
        title=f"Лид: {phone}" if phone else "Лид: звонок",
        notes=comm.content,
    )

    logger.info("Novofon webhook processed: comm_id=%s", comm.id)
    return {"status": "ok", "communication_id": str(comm.id)}


# ------------------------------------------------------------------
# Telegram
# ------------------------------------------------------------------

@router.post("/telegram")
async def telegram_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle an incoming Telegram bot update."""
    body = await request.json()

    secret = request.query_params.get("secret", "")
    stored_secret = await get_raw_value(db, "telegram_webhook_secret") or settings.TELEGRAM_WEBHOOK_SECRET
    if stored_secret and secret != stored_secret:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

    tg_token = await get_raw_value(db, "telegram_bot_token") or settings.TELEGRAM_BOT_TOKEN
    if not tg_token:
        logger.error("Telegram webhook: no bot token configured")
        return {"status": "ok"}

    global _tg_commands_registered
    tg_svc = TelegramBotService(bot_token=tg_token)
    result = await tg_svc.handle_incoming_message(body)

    chat_id = result.get("chat_id")
    is_callback = result.get("is_callback", False)
    callback_data = result.get("callback_data", "") or ""
    text = result.get("content", "") or ""
    user_id = result.get("telegram_user_id") or chat_id

    # Acknowledge button press immediately
    if is_callback:
        await tg_svc.answer_callback_query(result.get("callback_query_id", ""))

    # Communication is created only when user provides contacts (inside bot_flow)

    if not chat_id:
        return {"status": "ok"}

    # Upsert BotUser record on every interaction
    if user_id and chat_id:
        await _upsert_bot_user(db, "telegram", str(chat_id), str(user_id))

    is_start = text.strip() == "/start"

    # Register bot commands menu once per process
    if not _tg_commands_registered:
        _tg_commands_registered = True
        await tg_svc.set_my_commands()

    # Treat /book /ask /manager /menu as button payloads (same as inline keyboard)
    cmd_payload = ""
    if not is_callback and text.strip().startswith("/") and not is_start:
        cmd = text.strip().lstrip("/").split("@")[0].lower()
        if cmd in ("book", "ask", "manager", "menu"):
            cmd_payload = cmd
            text = ""

    ai_enabled = await get_raw_value(db, "telegram_bot_ai_enabled")

    # Load shared bot config (welcome + booking work without AI)
    clinic_name = (
        await get_raw_value(db, "bot_clinic_name")
        or await get_raw_value(db, "telegram_clinic_name")
        or await get_raw_value(db, "max_clinic_name")
        or "нашей клинике"
    )
    welcome_msg = await get_raw_value(db, "bot_welcome_message")

    # If AI disabled: only respond to /start, button presses, and bot commands
    if ai_enabled != "true" and not is_start and not is_callback and not cmd_payload:
        # Still allow messages in open conversation mode
        from app.services.bot_flow import get_active_conv
        if not await get_active_conv("tg", user_id):
            return {"status": "ok"}

    ai_key = await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY
    kb_ctx = await get_kb_context(db)
    raw_prompt = await get_raw_value(db, "telegram_bot_system_prompt")
    system_prompt = raw_prompt or _default_system_prompt(clinic_name)
    ai_svc = AIService(api_key=ai_key or None)

    resp = await bot_process(
        channel="tg",
        uid=user_id,
        is_start=is_start,
        payload=callback_data if is_callback else cmd_payload,
        text=text,
        chat_id=str(chat_id) if chat_id else None,
        db=db,
        clinic_name=clinic_name,
        welcome_message=welcome_msg,
        ai_svc=ai_svc,
        kb_ctx=kb_ctx,
        system_prompt=system_prompt,
    )
    await tg_svc.send_reply(chat_id, resp["text"], reply_markup=resp["kb"]["tg"])
    return {"status": "ok"}


# ------------------------------------------------------------------
# Max messenger
# ------------------------------------------------------------------

@router.post("/max")
async def max_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle Max messenger Bot API events."""
    body = await request.json()
    logger.warning("Max webhook raw: update_type=%s", body.get("update_type"))

    result = await _max_vk.handle_callback(body)
    logger.warning("Max webhook parsed: update_type=%s chat_id=%s user_id=%s is_callback=%s",
                   result.get("update_type"), result.get("max_chat_id"),
                   result.get("max_user_id"), result.get("is_callback"))

    if isinstance(result, dict) and result.get("status") == "ignored":
        return {"ok": True}

    chat_id = result.get("max_chat_id")
    user_id = result.get("max_user_id") or chat_id
    update_type = result.get("update_type", "")
    is_callback = result.get("is_callback", False)
    payload = result.get("callback_id_payload", "") or ""
    text = result.get("content", "") or ""

    # Communication is created only when user provides contacts (inside bot_flow)

    if not chat_id:
        logger.warning("Max webhook: no chat_id, skipping reply")
        return {"ok": True}

    # Upsert BotUser record on every interaction (including bot_started)
    if user_id and chat_id:
        await _upsert_bot_user(db, "max", str(chat_id), str(user_id))

    max_token = await get_raw_value(db, "max_bot_token") or settings.MAX_API_KEY
    if not max_token:
        logger.error("Max webhook: no bot token configured")
        return {"ok": True}

    max_svc = MaxVkService(bot_token=max_token)

    if is_callback:
        await max_svc.answer_callback(result.get("callback_id", ""))

    clinic_name = (
        await get_raw_value(db, "bot_clinic_name")
        or await get_raw_value(db, "max_clinic_name")
        or await get_raw_value(db, "telegram_clinic_name")
        or "нашей клинике"
    )
    welcome_msg = await get_raw_value(db, "bot_welcome_message")
    ai_enabled = await get_raw_value(db, "max_bot_ai_enabled")
    is_start = (update_type == "bot_started")

    btn_payload = payload
    if not btn_payload and is_callback:
        raw_payload = result.get("content", "")
        if raw_payload.startswith("[кнопка] "):
            btn_payload = raw_payload[9:]

    if ai_enabled != "true" and not is_start and not btn_payload:
        logger.warning("Max webhook: AI disabled, skipping text reply for update_type=%s", update_type)
        return {"ok": True}

    ai_key = await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY
    kb_ctx = await get_kb_context(db)
    raw_prompt = await get_raw_value(db, "max_bot_system_prompt")
    system_prompt = raw_prompt or _default_system_prompt(clinic_name)
    ai_svc = AIService(api_key=ai_key or None)

    try:
        resp = await bot_process(
            channel="max",
            uid=user_id,
            is_start=is_start,
            payload=btn_payload if is_callback else "",
            text=text if not is_callback else "",
            chat_id=str(chat_id) if chat_id else None,
            db=db,
            clinic_name=clinic_name,
            welcome_message=welcome_msg,
            ai_svc=ai_svc,
            kb_ctx=kb_ctx,
            system_prompt=system_prompt,
        )
        clean_text = resp["text"].replace("<b>", "").replace("</b>", "")
        logger.warning("Max webhook: sending reply len=%d buttons=%d to chat_id=%s",
                       len(clean_text), len(resp["kb"]["max"]), chat_id)
        await max_svc.send_reply(chat_id, clean_text, buttons=resp["kb"]["max"])
    except Exception:
        logger.exception("Max webhook: failed to send reply to chat_id=%s", chat_id)

    return {"ok": True}


def _default_system_prompt(clinic_name: str) -> str:
    return (
        f"Ты — вежливый AI-ассистент стоматологии «{clinic_name}». "
        "Строго следуй только данным из базы знаний клиники. "
        "Не придумывай цены, услуги или время работы — используй только то, что есть в базе знаний. "
        "Если нужной информации нет в базе знаний, честно скажи об этом и предложи позвонить в клинику. "
        "Отвечай кратко и по делу на русском языке."
    )


# ------------------------------------------------------------------
# Website / Tilda form
# ------------------------------------------------------------------

@router.get("/site")
async def site_form_test():
    """GET-эндпоинт для проверки доступности URL из браузера."""
    return {"status": "ok", "endpoint": "site webhook is reachable"}


@router.post("/site")
async def site_form_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle website / Tilda contact-form submissions.

    Tilda отправляет POST с Content-Type: application/x-www-form-urlencoded.
    Поддерживаем также JSON.  Всегда возвращаем 200, чтобы Тильда не
    считала вебхук недоступным.
    """
    try:
        # Read raw bytes first so body is available for both form and HMAC check
        raw_body = await request.body()
        content_type = request.headers.get("content-type", "")

        logger.info(
            "Site webhook received: content_type=%r body_len=%d",
            content_type, len(raw_body),
        )

        # Parse based on content type.
        # Use urllib.parse.parse_qs directly on raw bytes with explicit UTF-8
        # so we don't depend on python-multipart's default charset (which varies).
        if "application/x-www-form-urlencoded" in content_type:
            from urllib.parse import parse_qs
            try:
                parsed = parse_qs(raw_body, encoding="utf-8", keep_blank_values=True)
                body: dict = {
                    (k.decode("utf-8") if isinstance(k, bytes) else k): (
                        v[0].decode("utf-8") if isinstance(v[0], bytes) else v[0]
                    )
                    for k, v in parsed.items() if v
                }
            except Exception:
                # Last-resort: decode body as utf-8 string then parse
                parsed = parse_qs(raw_body.decode("utf-8", errors="replace"), keep_blank_values=True)
                body = {k: v[0] for k, v in parsed.items() if v}
        elif "multipart/form-data" in content_type:
            form = await request.form()
            body = dict(form)
        else:
            try:
                import json as _json
                body = _json.loads(raw_body) if raw_body else {}
            except Exception:
                body = {}

        logger.info("Site webhook body keys: %s", list(body.keys()))

        # Optional Tilda secret validation
        tilda_secret = await get_raw_value(db, "tilda_secret")
        if tilda_secret:
            import hashlib, hmac as _hmac
            sign_header = request.headers.get("X-Tilda-Sign", "") or str(body.get("sign", ""))
            expected = _hmac.new(tilda_secret.encode(), raw_body, hashlib.sha256).hexdigest()
            if sign_header and sign_header != expected:
                logger.warning("Invalid Tilda signature — ignoring")
                return {"status": "ok"}  # return 200 anyway so Tilda doesn't disable webhook

        # Normalize field names — Tilda uses various capitalizations
        def _get(*keys: str) -> str:
            for k in keys:
                for variant in (k, k.lower(), k.upper(), k.capitalize()):
                    v = body.get(variant)
                    if v:
                        return str(v).strip()
            return ""

        # System Tilda fields we skip when building content
        _TILDA_SYSTEM_KEYS = {
            "tildaspec-js-fields", "tildaspec-step", "tildaspec-form-name",
            "formid", "formname", "tranid", "sign",
        }
        # Known semantic field names
        _NAME_KEYS    = {"name", "NAME", "Name"}
        _PHONE_KEYS   = {"phone", "Phone", "PHONE", "tel", "Tel", "телефон"}
        _EMAIL_KEYS   = {"email", "Email", "EMAIL"}
        _COMMENT_KEYS = {"comment", "Comment", "message", "Message", "text", "Text", "комментарий"}
        _SERVICE_KEYS = {"service", "Service", "Услуга", "услуга", "select"}

        name    = _get("Name", "name", "NAME")
        phone   = _get("Phone", "phone", "PHONE", "tel", "Tel", "телефон")
        email   = _get("Email", "email", "EMAIL")
        message = _get("Comment", "comment", "Message", "message", "Text", "text", "комментарий")
        service = _get("Service", "service", "Услуга", "услуга", "select")
        form_name = _get("formname", "formid", "tildaspec-form-name", "FORMID")

        logger.info(
            "Site webhook parsed: name=%r phone=%r email=%r service=%r form=%r",
            name, phone, email, service, form_name,
        )

        # Build content: start with known fields, then append any remaining fields
        # so that whatever name Tilda uses for dropdowns/custom fields is preserved
        known_keys = _NAME_KEYS | _PHONE_KEYS | _EMAIL_KEYS | _COMMENT_KEYS | _SERVICE_KEYS | _TILDA_SYSTEM_KEYS
        content_parts = []
        if message:   content_parts.append(message)
        if service:   content_parts.append(f"Услуга: {service}")
        if name:      content_parts.append(f"Имя: {name}")
        if email:     content_parts.append(f"Email: {email}")
        if form_name: content_parts.append(f"Форма: {form_name}")

        # Append extra fields (e.g. unknown select/dropdown names from Tilda form builder)
        for k, v in body.items():
            if v and k not in known_keys:
                content_parts.append(f"{k}: {v}")

        content = "\n".join(content_parts) or "Заявка с сайта"

        # Try to link to existing patient by phone
        patient_id = None
        if phone:
            stmt = select(Patient).where(Patient.phone == phone).limit(1)
            row = await db.execute(stmt)
            patient = row.scalar_one_or_none()
            if patient:
                patient_id = patient.id

        # Build template AI summary immediately (no OpenAI call needed)
        summary_parts = []
        if name:    summary_parts.append(f"Заявка от {name}")
        if phone:   summary_parts.append(f"тел. {phone}")
        if service: summary_parts.append(f"услуга: {service}")
        ai_summary = (". ".join(summary_parts) + ". Ожидает обработки.") if summary_parts else None
        ai_tags = ["заявка_с_сайта"]
        if service:
            ai_tags.append("услуга_указана")

        comm = Communication(
            patient_id=patient_id,
            channel="site",
            direction="inbound",
            type="form",
            content=content,
            status="new",
            priority="high",
            ai_summary=ai_summary,
            ai_tags=ai_tags,
        )
        db.add(comm)
        await db.commit()

        await realtime.publish("new_communication", {
            "id": str(comm.id),
            "channel": comm.channel,
            "type": comm.type,
            "priority": comm.priority,
        })

        from app.services.deals_service import maybe_create_auto_lead
        lead_title = f"Лид: {name}, {phone}" if (name and phone) else (
            f"Лид: {name}" if name else f"Заявка с сайта{f', {phone}' if phone else ''}"
        )
        await maybe_create_auto_lead(
            channel="site",
            patient_id=patient_id,
            title=lead_title,
            notes=content,
        )

        logger.info("Site form saved: comm_id=%s phone=%s name=%s", comm.id, phone, name)

    except Exception:
        # Never return 5xx to Tilda — it will disable the webhook
        logger.exception("Error in site_form_webhook — returning 200 anyway")

    return {"status": "ok"}
