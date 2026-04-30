"""CRM pipeline deals service — real database queries."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.deal import Deal, DealStageHistory
from app.models.deal_note import DealNote
from app.models.patient import Patient
from app.models.user import User
from app.schemas.deal import (
    DealNote as DealNoteSchema,
    DealResponse,
    PipelineResponse,
    StageColumn,
    StageHistoryEntry,
)

STAGES = [
    ("new", "Новые"),
    ("contact", "Контакт"),
    ("negotiation", "Переговоры"),
    ("scheduled", "Записан"),
    ("treatment", "Лечение"),
    ("closed_won", "Закрыто ✓"),
    ("closed_lost", "Закрыто ✗"),
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _deal_to_response(deal: Deal, db: AsyncSession) -> DealResponse:
    patient_name = None
    source_channel = None
    if deal.patient_id:
        patient = (await db.execute(
            select(Patient.name, Patient.source_channel).where(Patient.id == deal.patient_id)
        )).first()
        if patient:
            patient_name = patient.name
            source_channel = patient.source_channel

    assigned_to_name = None
    if deal.assigned_to:
        user = (await db.execute(
            select(User.name).where(User.id == deal.assigned_to)
        )).scalar_one_or_none()
        assigned_to_name = user

    return DealResponse(
        id=deal.id,
        patient_id=deal.patient_id,
        patient_name=patient_name,
        title=deal.title,
        stage=deal.stage,
        amount=float(deal.amount) if deal.amount else None,
        service=deal.service,
        doctor_name=deal.doctor_name,
        assigned_to=deal.assigned_to,
        assigned_to_name=assigned_to_name,
        source_channel=source_channel or deal.source_channel,
        notes=deal.notes,
        lost_reason=deal.lost_reason,
        stage_changed_at=deal.stage_changed_at,
        created_at=deal.created_at,
    )


async def get_pipeline(
    stage: str | None = None,
    assigned_to: str | None = None,
) -> PipelineResponse:
    async with async_session_factory() as db:
        stmt = select(Deal).order_by(Deal.stage_changed_at.desc())
        if stage:
            stmt = stmt.where(Deal.stage == stage)
        if assigned_to:
            stmt = stmt.where(Deal.assigned_to == uuid.UUID(assigned_to))

        result = await db.execute(stmt)
        deals = result.scalars().all()

        deal_responses = [await _deal_to_response(d, db) for d in deals]

        columns: list[StageColumn] = []
        total_value = 0.0

        for stage_key, label in STAGES:
            stage_deals = [d for d in deal_responses if d.stage == stage_key]
            stage_total = sum(d.amount or 0 for d in stage_deals)
            total_value += stage_total
            columns.append(
                StageColumn(
                    stage=stage_key,
                    label=label,
                    deals=stage_deals,
                    count=len(stage_deals),
                    total_amount=stage_total,
                )
            )

        return PipelineResponse(stages=columns, total_pipeline_value=total_value)


async def get_deal(deal_id: uuid.UUID) -> DealResponse | None:
    async with async_session_factory() as db:
        deal = (await db.execute(
            select(Deal).where(Deal.id == deal_id)
        )).scalar_one_or_none()
        if not deal:
            return None
        return await _deal_to_response(deal, db)


async def create_deal(
    title: str,
    stage: str = "new",
    patient_id: uuid.UUID | None = None,
    amount: float | None = None,
    service: str | None = None,
    assigned_to: uuid.UUID | None = None,
    notes: str | None = None,
    doctor_name: str | None = None,
    source_channel: str | None = None,
    patient_name: str | None = None,
    patient_phone: str | None = None,
) -> DealResponse:
    async with async_session_factory() as db:
        if not patient_id and patient_phone:
            existing = (await db.execute(
                select(Patient).where(Patient.phone == patient_phone)
            )).scalar_one_or_none()
            if existing:
                patient_id = existing.id
            elif patient_name:
                patient = Patient(
                    name=patient_name,
                    phone=patient_phone,
                    source_channel=source_channel or "manual",
                    is_new_patient=True,
                )
                db.add(patient)
                await db.flush()
                patient_id = patient.id

        deal = Deal(
            patient_id=patient_id,
            title=title,
            stage=stage,
            amount=amount,
            service=service,
            doctor_name=doctor_name,
            assigned_to=assigned_to,
            source_channel=source_channel,
            notes=notes,
        )
        db.add(deal)

        history = DealStageHistory(
            deal_id=deal.id,
            from_stage=None,
            to_stage=stage,
            changed_by=None,
            comment="Сделка создана",
        )
        db.add(history)

        await db.commit()
        return await _deal_to_response(deal, db)


async def update_deal(
    deal_id: uuid.UUID,
    stage: str | None = None,
    amount: float | None = None,
    notes: str | None = None,
    lost_reason: str | None = None,
    title: str | None = None,
    service: str | None = None,
    doctor_name: str | None = None,
    assigned_to: uuid.UUID | None = None,
    source_channel: str | None = None,
) -> DealResponse | None:
    async with async_session_factory() as db:
        deal = (await db.execute(
            select(Deal).where(Deal.id == deal_id)
        )).scalar_one_or_none()
        if not deal:
            return None

        if stage is not None and stage != deal.stage:
            old_stage = deal.stage
            deal.stage = stage
            deal.stage_changed_at = _now()
            if stage in ("closed_won", "closed_lost"):
                deal.closed_at = _now()
            db.add(DealStageHistory(
                deal_id=deal_id,
                from_stage=old_stage,
                to_stage=stage,
                changed_by=None,
            ))

        if amount is not None:
            deal.amount = amount
        if notes is not None:
            deal.notes = notes
        if lost_reason is not None:
            deal.lost_reason = lost_reason
        if title is not None:
            deal.title = title
        if service is not None:
            deal.service = service
        if doctor_name is not None:
            deal.doctor_name = doctor_name
        if assigned_to is not None:
            deal.assigned_to = assigned_to
        if source_channel is not None:
            deal.source_channel = source_channel

        await db.commit()
        return await _deal_to_response(deal, db)


async def delete_deal(deal_id: uuid.UUID) -> bool:
    async with async_session_factory() as db:
        deal = (await db.execute(
            select(Deal).where(Deal.id == deal_id)
        )).scalar_one_or_none()
        if not deal:
            return False
        await db.delete(deal)
        await db.commit()
        return True


async def get_deal_history(deal_id: uuid.UUID) -> list[StageHistoryEntry]:
    async with async_session_factory() as db:
        result = await db.execute(
            select(DealStageHistory)
            .where(DealStageHistory.deal_id == deal_id)
            .order_by(DealStageHistory.created_at)
        )
        return [
            StageHistoryEntry.model_validate(h)
            for h in result.scalars().all()
        ]


async def add_deal_note(deal_id: uuid.UUID, text: str, author_id: uuid.UUID | None = None) -> DealNoteSchema:
    async with async_session_factory() as db:
        note = DealNote(deal_id=deal_id, text=text, author_id=author_id)
        db.add(note)
        await db.flush()

        author_name = None
        if author_id:
            author_name = (await db.execute(
                select(User.name).where(User.id == author_id)
            )).scalar_one_or_none()

        await db.commit()
        return DealNoteSchema(
            id=note.id,
            deal_id=deal_id,
            text=text,
            author_name=author_name,
            created_at=note.created_at,
        )


async def get_deal_notes(deal_id: uuid.UUID) -> list[DealNoteSchema]:
    async with async_session_factory() as db:
        result = await db.execute(
            select(DealNote, User.name.label("author_name"))
            .outerjoin(User, DealNote.author_id == User.id)
            .where(DealNote.deal_id == deal_id)
            .order_by(DealNote.created_at.desc())
        )
        return [
            DealNoteSchema(
                id=row.DealNote.id,
                deal_id=deal_id,
                text=row.DealNote.text,
                author_name=row.author_name,
                created_at=row.DealNote.created_at,
            )
            for row in result.all()
        ]
