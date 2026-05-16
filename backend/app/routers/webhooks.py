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

from app.config import settings
from app.database import get_db
from app.models.communication import Communication
from app.models.patient import Patient
from app.models.task import Task
from app.services.novofon import NovofonService
from app.services.telegram_bot import TelegramBotService, _INLINE_KEYBOARD
from app.services.max_vk import MaxVkService
from app.services.realtime import realtime
from app.services.integrations_service import get_raw_value
from app.services.ai_service import AIService
from app.routers.knowledge_base import get_kb_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

# Service singletons (stateless, cheap to create)
_novofon = NovofonService()
_telegram = TelegramBotService()
# Max service is created per-request so it picks up the latest db token
_max_vk = MaxVkService()


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

async def _get_slots(db: AsyncSession) -> list[dict]:
    """Fetch up to 5 available appointment slots from 1Denta (best-effort)."""
    try:
        from datetime import date, timedelta
        from app.services.one_denta import OneDentaService
        svc = OneDentaService()
        date_from = date.today()
        date_to = date_from + timedelta(days=7)
        appts = await svc.get_appointments(str(date_from), str(date_to))
        # Return raw appointments as "busy" info; for slots we'd need get_available_slots
        # Here we build a simplified slot list from appointments response structure
        slots = []
        for a in (appts or [])[:5]:
            slots.append({
                "datetime": a.get("scheduled_at") or a.get("date", ""),
                "doctor": a.get("doctor_name", "Врач"),
            })
        return slots
    except Exception:
        return []


# ------------------------------------------------------------------
# Novofon (telephony)
# ------------------------------------------------------------------

def _parse_novofon_notification(body: dict) -> dict:
    """Map Novofon notification fields to our internal call-event format.

    Novofon HTTP-notifications use different field names than the classic
    Zadarma-style webhook events, so we normalise them here.
    """
    if "caller_id" in body or "event" in body:
        return body  # already in our format

    # Map notification template variables to internal fields
    notification_name = body.get("notification_name", "").lower()
    if "потерян" in notification_name or "missed" in notification_name:
        event = "missed"
    elif "завершён" in notification_name or "end" in notification_name:
        event = "notify_end"
    else:
        event = "notify_start"

    return {
        "event": event,
        "caller_id": body.get("contact_phone_number", ""),
        "called_did": body.get("virtual_phone_number", ""),
        "call_id": body.get("call_session_id") or body.get("communication_number", ""),
        "duration": int(body.get("wait_time_duration") or 0),
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

    comm = Communication(
        patient_id=patient_id,
        channel=result["channel"],
        direction=result["direction"],
        type=result["type"],
        content=result.get("content"),
        duration_sec=result.get("duration_sec"),
        status=result["status"],
        priority=result["priority"],
        external_id=result.get("external_id"),
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
    """Handle an incoming Telegram bot update with AI consultation reply."""
    body = await request.json()

    # Validate secret (passed as query param by Telegram setWebhook)
    secret = request.query_params.get("secret", "")
    stored_secret = await get_raw_value(db, "telegram_webhook_secret") or settings.TELEGRAM_WEBHOOK_SECRET
    if stored_secret and secret != stored_secret:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

    result = await _telegram.handle_incoming_message(body)

    chat_id = result.get("chat_id")
    is_callback = result.get("is_callback", False)
    callback_data = result.get("callback_data", "")

    # --- Handle inline button presses ---
    if is_callback and chat_id:
        cq_id = result.get("callback_query_id", "")
        await _telegram.answer_callback_query(cq_id)

        if callback_data == "book_appointment":
            slots = await _get_slots(db)
            ai_key = await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY
            system_prompt = await get_raw_value(db, "telegram_bot_system_prompt")
            kb_ctx = await get_kb_context(db)
            ai_svc = AIService(api_key=ai_key or None)
            reply = await ai_svc.chat_with_patient(
                "Пациент хочет записаться на приём. Покажи доступные слоты и предложи выбрать.",
                kb_context=kb_ctx,
                system_prompt=system_prompt,
                available_slots=slots,
            )
            await _telegram.send_reply(chat_id, reply, reply_markup=_INLINE_KEYBOARD)
        elif callback_data == "contact_clinic":
            await _telegram.send_reply(
                chat_id,
                "📞 Для связи с клиникой позвоните нам или напишите администратору.",
                reply_markup=_INLINE_KEYBOARD,
            )
        return {"status": "ok"}

    if not result.get("content"):
        return {"status": "ok"}

    # --- Persist communication ---
    comm = Communication(
        channel=result["channel"],
        direction=result["direction"],
        type=result["type"],
        content=result.get("content"),
        status=result["status"],
        priority=result["priority"],
        external_id=result.get("external_id"),
    )
    db.add(comm)
    await db.commit()

    await realtime.publish("new_communication", {
        "id": str(comm.id),
        "channel": comm.channel,
        "type": comm.type,
        "priority": comm.priority,
    })

    logger.info("Telegram webhook processed: comm_id=%s", comm.id)

    # --- AI auto-reply ---
    if not chat_id:
        return {"status": "ok", "communication_id": str(comm.id)}

    ai_enabled = await get_raw_value(db, "telegram_bot_ai_enabled")
    if ai_enabled != "true":
        return {"status": "ok", "communication_id": str(comm.id)}

    text = result.get("content", "")

    # /start command → welcome message
    if text.strip() == "/start":
        clinic_name = await get_raw_value(db, "telegram_clinic_name") or "нашей клинике"
        await _telegram.send_reply(
            chat_id,
            _telegram.welcome_text(clinic_name),
            reply_markup=_INLINE_KEYBOARD,
        )
        return {"status": "ok", "communication_id": str(comm.id)}

    # Regular message → AI consultation
    ai_key = await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY
    system_prompt = await get_raw_value(db, "telegram_bot_system_prompt")
    kb_ctx = await get_kb_context(db)

    slots: list[dict] = []
    if any(w in text.lower() for w in ["запис", "приём", "прием", "свободн", "слот", "время"]):
        slots = await _get_slots(db)

    ai_svc = AIService(api_key=ai_key or None)
    reply = await ai_svc.chat_with_patient(
        text,
        kb_context=kb_ctx,
        system_prompt=system_prompt,
        available_slots=slots,
    )
    await _telegram.send_reply(chat_id, reply, reply_markup=_INLINE_KEYBOARD)

    return {"status": "ok", "communication_id": str(comm.id)}


# ------------------------------------------------------------------
# Max messenger
# ------------------------------------------------------------------

@router.post("/max")
async def max_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle Max messenger Bot API events with AI consultation reply.

    Max sends POST requests for every update (message_created,
    message_callback, bot_started, etc.).  The handler must return
    HTTP 200 OK — any other status causes retries.
    """
    body = await request.json()

    result = await _max_vk.handle_callback(body)

    # Ignored event types — just ack
    if isinstance(result, dict) and result.get("status") == "ignored":
        return {"ok": True}

    # Persist Communication
    comm = Communication(
        channel=result["channel"],
        direction=result["direction"],
        type=result["type"],
        content=result.get("content"),
        status=result["status"],
        priority=result["priority"],
        external_id=result.get("external_id"),
    )
    db.add(comm)
    await db.commit()

    await realtime.publish("new_communication", {
        "id": str(comm.id),
        "channel": comm.channel,
        "type": comm.type,
        "priority": comm.priority,
    })

    logger.info("Max webhook processed: comm_id=%s update_type=%s", comm.id, result.get("update_type"))

    chat_id = result.get("max_chat_id")
    if not chat_id:
        return {"ok": True}

    # Re-create service with token from DB (may differ from env)
    max_token = await get_raw_value(db, "max_bot_token") or settings.MAX_API_KEY
    max_svc = MaxVkService(bot_token=max_token)

    ai_enabled = await get_raw_value(db, "max_bot_ai_enabled")
    if ai_enabled != "true":
        return {"ok": True}

    update_type = result.get("update_type", "")
    is_booking = result.get("is_booking_button", False)
    is_callback = result.get("is_callback", False)
    text = result.get("content", "")

    # Acknowledge button press
    if is_callback:
        callback_id = result.get("callback_id", "")
        await max_svc.answer_callback(callback_id)

    # bot_started → welcome message
    if update_type == "bot_started":
        clinic_name = await get_raw_value(db, "max_clinic_name") or await get_raw_value(db, "telegram_clinic_name") or "нашей клинике"
        await max_svc.send_reply(
            chat_id,
            max_svc.welcome_text(clinic_name),
            buttons=max_svc.book_keyboard(),
        )
        return {"ok": True}

    # Build AI reply
    slots: list[dict] = []
    if is_booking or any(w in text.lower() for w in ["запис", "приём", "прием", "свободн", "слот", "время"]):
        slots = await _get_slots(db)

    ai_key = await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY
    system_prompt = await get_raw_value(db, "max_bot_system_prompt")
    kb_ctx = await get_kb_context(db)

    query = "Пациент хочет записаться на приём. Покажи доступные слоты." if is_booking else text
    ai_svc = AIService(api_key=ai_key or None)
    reply = await ai_svc.chat_with_patient(
        query,
        kb_context=kb_ctx,
        system_prompt=system_prompt,
        available_slots=slots,
    )
    await max_svc.send_reply(chat_id, reply, buttons=max_svc.book_keyboard())

    return {"ok": True}


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

        logger.info("Site form saved: comm_id=%s phone=%s name=%s", comm.id, phone, name)

    except Exception:
        # Never return 5xx to Tilda — it will disable the webhook
        logger.exception("Error in site_form_webhook — returning 200 anyway")

    return {"status": "ok"}
