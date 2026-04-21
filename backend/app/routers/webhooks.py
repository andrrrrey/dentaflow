"""Webhook endpoints for external integrations.

All endpoints live under ``/api/v1/webhooks`` and do **not** require the
standard JWT auth — they validate requests using channel-specific webhook
secrets instead.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.communication import Communication
from app.models.patient import Patient
from app.models.task import Task
from app.services.novofon import NovofonService
from app.services.telegram_bot import TelegramBotService
from app.services.max_vk import MaxVkService
from app.services.realtime import realtime

from fastapi import Depends

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

# Service singletons (stateless, cheap to create)
_novofon = NovofonService()
_telegram = TelegramBotService()
_max_vk = MaxVkService()


# ------------------------------------------------------------------
# Novofon (telephony)
# ------------------------------------------------------------------

@router.post("/novofon")
async def novofon_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle an incoming Novofon call event."""
    # Validate webhook secret
    body = await request.json()
    secret = body.get("webhook_secret") or request.headers.get("X-Webhook-Secret", "")
    if settings.NOVOFON_WEBHOOK_SECRET and secret != settings.NOVOFON_WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

    result = await _novofon.handle_call_event(body)

    # Find patient by phone
    patient_id = None
    phone = result.get("phone")
    if phone:
        stmt = select(Patient).where(Patient.phone == phone).limit(1)
        row = await db.execute(stmt)
        patient = row.scalar_one_or_none()
        if patient:
            patient_id = patient.id

    # Create Communication
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

    # Auto-create callback task for missed calls
    if result.get("create_callback_task"):
        task = Task(
            patient_id=patient_id,
            comm_id=comm.id,
            type="callback",
            title=f"Перезвонить: {phone or 'неизвестный номер'}",
        )
        db.add(task)

    await db.commit()

    # Publish real-time event
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
    """Handle an incoming Telegram bot update."""
    body = await request.json()

    # Validate secret (passed as query param by Telegram setWebhook)
    secret = request.query_params.get("secret", "")
    if settings.TELEGRAM_WEBHOOK_SECRET and secret != settings.TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

    result = await _telegram.handle_incoming_message(body)

    if not result.get("content"):
        # Non-text update (sticker, etc.) — acknowledge without saving
        return {"status": "ok"}

    # Try to find patient by telegram_chat_id (stored on Patient is not standard,
    # so we skip patient lookup for now — can be extended later)
    patient_id = None

    comm = Communication(
        patient_id=patient_id,
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
    return {"status": "ok", "communication_id": str(comm.id)}


# ------------------------------------------------------------------
# Max / VK
# ------------------------------------------------------------------

@router.post("/max")
async def max_vk_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle VK Callback API events."""
    body = await request.json()

    result = await _max_vk.handle_callback(body)

    # Confirmation requests return a plain string
    if isinstance(result, str):
        return Response(content=result, media_type="text/plain")

    # Ignored event types
    if isinstance(result, dict) and result.get("status") == "ignored":
        return Response(content="ok", media_type="text/plain")

    # Message event — persist Communication
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

    logger.info("VK webhook processed: comm_id=%s", comm.id)
    # VK expects "ok" as response body
    return Response(content="ok", media_type="text/plain")


# ------------------------------------------------------------------
# Website form
# ------------------------------------------------------------------

@router.post("/site")
async def site_form_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle website contact-form submissions."""
    body = await request.json()

    name = body.get("name", "")
    phone = body.get("phone", "")
    email = body.get("email", "")
    message = body.get("message", "")
    service = body.get("service", "")

    content_parts = []
    if message:
        content_parts.append(message)
    if service:
        content_parts.append(f"Услуга: {service}")
    if name:
        content_parts.append(f"Имя: {name}")
    if email:
        content_parts.append(f"Email: {email}")
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
    return {"status": "ok", "communication_id": str(comm.id)}
