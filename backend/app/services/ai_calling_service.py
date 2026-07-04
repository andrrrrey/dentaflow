"""Оркестрация ИИ-обзвона: кампании из сегментов, окна/расписание, запись результатов.

Звонок ведёт aicallrobot (диалог) + Asterisk (телефония). Здесь — только бизнес-
логика кампании: какие пациенты, когда звонить (окна), сколько одновременно,
и куда складывать исход.
"""

from __future__ import annotations

import json
import re
import logging
import uuid
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_calling import AiCallingCampaign, AiCallingCampaignItem
from app.models.communication import Communication
from app.models.patient import Patient
from app.models.patient_segment import PatientSegment, PatientSegmentMember

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = ("scheduled", "running", "waiting_window", "paused")


def normalize_phone(phone: str) -> str:
    """Приводит номер к набираемому виду: только цифры, 8XXXXXXXXXX → 7XXXXXXXXXX."""
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    return digits


# ---------------------------------------------------------------------------
# Аудитория
# ---------------------------------------------------------------------------

async def resolve_segment_patients(db: AsyncSession, segment_key: str) -> list[dict]:
    """Все пациенты сегмента с непустым телефоном → [{patient_id, phone}]."""
    seg = (
        await db.execute(select(PatientSegment).where(PatientSegment.key == segment_key))
    ).scalar_one_or_none()
    if seg is None:
        return []
    rows = (
        await db.execute(
            select(Patient.id, Patient.phone)
            .join(PatientSegmentMember, PatientSegmentMember.patient_id == Patient.id)
            .where(PatientSegmentMember.segment_id == seg.id)
        )
    ).all()
    return [
        {"patient_id": pid, "phone": phone.strip()}
        for pid, phone in rows
        if phone and phone.strip()
    ]


# ---------------------------------------------------------------------------
# CRUD кампаний
# ---------------------------------------------------------------------------

async def create_campaign(
    db: AsyncSession,
    *,
    name: str,
    segment_key: str,
    scenario_id: str = "default",
    max_concurrent: int = 1,
    scheduled_at: datetime | None = None,
    window_start: str | None = None,
    window_end: str | None = None,
    tz: str = "Europe/Moscow",
    created_by: uuid.UUID | None = None,
) -> AiCallingCampaign:
    members = await resolve_segment_patients(db, segment_key)
    campaign = AiCallingCampaign(
        name=name,
        segment_key=segment_key,
        scenario_id=scenario_id or "default",
        status="scheduled",
        max_concurrent=max(1, int(max_concurrent or 1)),
        scheduled_at=scheduled_at,
        window_start=window_start,
        window_end=window_end,
        timezone=tz or "Europe/Moscow",
        total=len(members),
        created_by=created_by,
    )
    db.add(campaign)
    await db.flush()
    for m in members:
        db.add(
            AiCallingCampaignItem(
                campaign_id=campaign.id,
                patient_id=m["patient_id"],
                phone=m["phone"],
                status="pending",
            )
        )
    await db.commit()
    await db.refresh(campaign)
    logger.info("Кампания обзвона создана: %s (%d пациентов)", campaign.id, len(members))
    return campaign


async def list_campaigns(db: AsyncSession) -> list[AiCallingCampaign]:
    return list(
        (
            await db.execute(
                select(AiCallingCampaign).order_by(AiCallingCampaign.created_at.desc())
            )
        ).scalars().all()
    )


async def get_campaign(db: AsyncSession, campaign_id: uuid.UUID) -> AiCallingCampaign | None:
    return (
        await db.execute(select(AiCallingCampaign).where(AiCallingCampaign.id == campaign_id))
    ).scalar_one_or_none()


async def list_items(db: AsyncSession, campaign_id: uuid.UUID) -> list[AiCallingCampaignItem]:
    return list(
        (
            await db.execute(
                select(AiCallingCampaignItem)
                .where(AiCallingCampaignItem.campaign_id == campaign_id)
                .order_by(AiCallingCampaignItem.created_at.asc())
            )
        ).scalars().all()
    )


async def control_campaign(
    db: AsyncSession, campaign_id: uuid.UUID, action: str
) -> AiCallingCampaign | None:
    """action: start | pause | resume | cancel."""
    campaign = await get_campaign(db, campaign_id)
    if campaign is None:
        return None
    if action in ("start", "resume"):
        if campaign.status in ("completed", "cancelled"):
            return campaign
        campaign.status = "running"
        if campaign.started_at is None:
            campaign.started_at = datetime.now(timezone.utc)
    elif action == "pause":
        if campaign.status in ("running", "waiting_window", "scheduled"):
            campaign.status = "paused"
    elif action == "cancel":
        campaign.status = "cancelled"
        campaign.ended_at = datetime.now(timezone.utc)
        # Снимаем ещё не начатые звонки.
        for item in await list_items(db, campaign_id):
            if item.status in ("pending", "calling"):
                item.status = "cancelled"
    await db.commit()
    await db.refresh(campaign)
    return campaign


# ---------------------------------------------------------------------------
# Окна / расписание
# ---------------------------------------------------------------------------

def _parse_hhmm(value: str | None) -> time | None:
    if not value:
        return None
    try:
        hh, mm = value.split(":")
        return time(int(hh), int(mm))
    except (ValueError, AttributeError):
        return None


def is_within_window(campaign: AiCallingCampaign, now_utc: datetime | None = None) -> bool:
    """True, если сейчас внутри разрешённого окна обзвона (по таймзоне кампании)."""
    start = _parse_hhmm(campaign.window_start)
    end = _parse_hhmm(campaign.window_end)
    if start is None or end is None:
        return True  # окно не задано — звоним всегда
    now_utc = now_utc or datetime.now(timezone.utc)
    try:
        local = now_utc.astimezone(ZoneInfo(campaign.timezone or "Europe/Moscow"))
    except Exception:  # noqa: BLE001
        local = now_utc
    cur = local.time()
    if start <= end:
        return start <= cur <= end
    # Окно через полночь (напр. 22:00–06:00).
    return cur >= start or cur <= end


def schedule_reached(campaign: AiCallingCampaign, now_utc: datetime | None = None) -> bool:
    if campaign.scheduled_at is None:
        return True
    now_utc = now_utc or datetime.now(timezone.utc)
    sched = campaign.scheduled_at
    if sched.tzinfo is None:
        sched = sched.replace(tzinfo=timezone.utc)
    return sched <= now_utc


# ---------------------------------------------------------------------------
# Диспетчеризация слотов
# ---------------------------------------------------------------------------

async def count_in_flight(db: AsyncSession, campaign_id: uuid.UUID) -> int:
    rows = (
        await db.execute(
            select(AiCallingCampaignItem.id).where(
                AiCallingCampaignItem.campaign_id == campaign_id,
                AiCallingCampaignItem.status == "calling",
            )
        )
    ).all()
    return len(rows)


async def claim_pending_items(
    db: AsyncSession, campaign_id: uuid.UUID, slots: int
) -> list[uuid.UUID]:
    """Берёт до `slots` ожидающих звонков, помечает их `calling` и коммитит.

    Возвращает их id для последующего place_call. Пометка до коммита защищает от
    повторной выдачи на следующем тике.
    """
    if slots <= 0:
        return []
    items = (
        await db.execute(
            select(AiCallingCampaignItem)
            .where(
                AiCallingCampaignItem.campaign_id == campaign_id,
                AiCallingCampaignItem.status == "pending",
            )
            .order_by(AiCallingCampaignItem.created_at.asc())
            .limit(slots)
            .with_for_update(skip_locked=True)
        )
    ).scalars().all()
    claimed = []
    for item in items:
        item.status = "calling"
        item.attempts += 1
        claimed.append(item.id)
    await db.commit()
    return claimed


async def count_pending(db: AsyncSession, campaign_id: uuid.UUID) -> int:
    rows = (
        await db.execute(
            select(AiCallingCampaignItem.id).where(
                AiCallingCampaignItem.campaign_id == campaign_id,
                AiCallingCampaignItem.status == "pending",
            )
        )
    ).all()
    return len(rows)


# ---------------------------------------------------------------------------
# Запись результата звонка (B5)
# ---------------------------------------------------------------------------

async def record_call_result(
    db: AsyncSession,
    item_id: uuid.UUID,
    *,
    status: str,
    call_id: str | None = None,
    outcome: str | None = None,
    summary: str | None = None,
    duration_sec: int | None = None,
    transcript: list | None = None,
) -> None:
    """Сохраняет исход звонка: Communication + обновление item и счётчиков кампании."""
    item = (
        await db.execute(select(AiCallingCampaignItem).where(AiCallingCampaignItem.id == item_id))
    ).scalar_one_or_none()
    if item is None:
        return

    item.status = status
    item.outcome = outcome
    item.summary = summary
    item.duration_sec = duration_sec
    if call_id:
        item.call_id = call_id

    # Пишем Communication только для состоявшегося разговора.
    if status == "done":
        patient_id = item.patient_id
        if patient_id is None and item.phone:
            patient = (
                await db.execute(select(Patient).where(Patient.phone == item.phone).limit(1))
            ).scalar_one_or_none()
            patient_id = patient.id if patient else None

        comm = Communication(
            patient_id=patient_id,
            channel="novofon",
            direction="outbound",
            type="call",
            content=json.dumps(transcript, ensure_ascii=False) if transcript else None,
            duration_sec=duration_sec,
            status="new",
            priority="normal",
            ai_tags=["ai_robot"] + ([outcome] if outcome else []),
            ai_summary=summary,
            external_id=call_id,
        )
        db.add(comm)
        await db.flush()
        item.comm_id = comm.id

    # Счётчики кампании.
    campaign = await get_campaign(db, item.campaign_id)
    if campaign is not None:
        campaign.completed += 1
        if status == "done" and outcome in ("interested", "callback", "confirmed", "positive"):
            campaign.succeeded += 1
        elif status in ("failed", "no_answer"):
            campaign.failed += 1
        if campaign.completed >= campaign.total and await count_pending(db, campaign.id) == 0:
            if await count_in_flight(db, campaign.id) == 0:
                campaign.status = "completed"
                campaign.ended_at = datetime.now(timezone.utc)
    await db.commit()
