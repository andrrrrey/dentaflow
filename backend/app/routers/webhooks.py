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

@router.post("/novofon")
async def novofon_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle an incoming Novofon call event."""
    body = await request.json()
    secret = body.get("webhook_secret") or request.headers.get("X-Webhook-Secret", "")
    if settings.NOVOFON_WEBHOOK_SECRET and secret != settings.NOVOFON_WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

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

@router.post("/site")
async def site_form_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle website / Tilda contact-form submissions.

    Supports both JSON (standard) and ``application/x-www-form-urlencoded``
    (Tilda default). Field aliases: ``Name`` → name, ``Phone`` → phone,
    ``Email`` → email, ``Comment`` → message.

    Optional HMAC validation: if ``tilda_secret`` is configured, the
    ``X-Tilda-Sign`` header (or ``sign`` body field) must match
    ``sha256(secret + body_raw)``.
    """
    content_type = request.headers.get("content-type", "")

    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        body: dict = dict(form)
    else:
        try:
            body = await request.json()
        except Exception:
            body = {}

    # Tilda secret validation (optional)
    tilda_secret = await get_raw_value(db, "tilda_secret")
    if tilda_secret:
        import hashlib, hmac as _hmac
        sign_header = request.headers.get("X-Tilda-Sign", "") or str(body.get("sign", ""))
        raw_body = await request.body()
        expected = _hmac.new(
            tilda_secret.encode(),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if sign_header and sign_header != expected:
            raise HTTPException(status_code=403, detail="Invalid Tilda signature")

    # Normalize Tilda field names (they send capitalized keys)
    def _get(*keys: str) -> str:
        for k in keys:
            v = body.get(k) or body.get(k.lower()) or body.get(k.capitalize()) or ""
            if v:
                return str(v).strip()
        return ""

    name = _get("Name", "name")
    phone = _get("Phone", "phone", "tel")
    email = _get("Email", "email")
    message = _get("Comment", "message", "text", "Message")
    service = _get("Service", "service", "Услуга")

    # Tilda also sends formname / formid — log for debugging
    form_name = _get("formname", "formid", "tildaspec-form-name")
    if form_name:
        logger.info("Tilda form submission: form=%s phone=%s", form_name, phone)

    content_parts = []
    if message:
        content_parts.append(message)
    if service:
        content_parts.append(f"Услуга: {service}")
    if name:
        content_parts.append(f"Имя: {name}")
    if email:
        content_parts.append(f"Email: {email}")
    if form_name:
        content_parts.append(f"Форма: {form_name}")
    content = "\n".join(content_parts) or "Заявка с сайта"

    # Try to find existing patient by phone
    patient_id = None
    if phone:
        stmt = select(Patient).where(Patient.phone == phone).limit(1)
        row = await db.execute(stmt)
        patient = row.scalar_one_or_none()
        if patient:
            patient_id = patient.id

    comm = Communication(
        patient_id=patient_id,
        channel="site",
        direction="inbound",
        type="form",
        content=content,
        status="new",
        priority="high",
    )
    db.add(comm)
    await db.commit()

    await realtime.publish("new_communication", {
        "id": str(comm.id),
        "channel": comm.channel,
        "type": comm.type,
        "priority": comm.priority,
    })

    logger.info("Site form webhook processed: comm_id=%s phone=%s", comm.id, phone)
    # Tilda expects {"status": "ok"} JSON response
    return {"status": "ok", "communication_id": str(comm.id)}
