"""Patient service — real database queries."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment
from app.models.communication import Communication
from app.models.deal import Deal
from app.models.patient import Patient
from app.models.task import Task
from app.schemas.patient import (
    AIAnalysis,
    AppointmentResponse,
    CommunicationBrief,
    DealBrief,
    PatientDetailResponse,
    PatientListResponse,
    PatientResponse,
    PatientStats,
    TaskBrief,
)


async def get_patients(
    db: AsyncSession,
    search: str | None = None,
    visited: str | None = None,
    gender: str | None = None,
    patient_type: str | None = None,
    source_channel: str | None = None,
    birth_date_from: str | None = None,
    birth_date_to: str | None = None,
    last_visit_from: str | None = None,
    last_visit_to: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    revenue_min: float | None = None,
    revenue_max: float | None = None,
    visits_min: int | None = None,
    visits_max: int | None = None,
    page: int = 1,
    limit: int = 20,
) -> PatientListResponse:
    from datetime import date as date_type
    stmt = select(Patient)

    if search:
        q = f"%{search}%"
        stmt = stmt.where(
            Patient.name.ilike(q)
            | Patient.phone.ilike(q)
            | Patient.email.ilike(q)
        )
    if visited == "visited":
        stmt = stmt.where(Patient.last_visit_at.isnot(None))
    elif visited == "not_visited":
        stmt = stmt.where(Patient.last_visit_at.is_(None))
    if gender:
        stmt = stmt.where(Patient.gender == gender)
    if patient_type:
        stmt = stmt.where(Patient.patient_type == patient_type)
    if source_channel:
        stmt = stmt.where(Patient.source_channel == source_channel)
    if birth_date_from:
        try:
            stmt = stmt.where(Patient.birth_date >= date_type.fromisoformat(birth_date_from))
        except ValueError:
            pass
    if birth_date_to:
        try:
            stmt = stmt.where(Patient.birth_date <= date_type.fromisoformat(birth_date_to))
        except ValueError:
            pass
    if last_visit_from:
        try:
            stmt = stmt.where(Patient.last_visit_at >= datetime.fromisoformat(last_visit_from))
        except ValueError:
            pass
    if last_visit_to:
        try:
            stmt = stmt.where(Patient.last_visit_at <= datetime.fromisoformat(last_visit_to))
        except ValueError:
            pass
    if created_from:
        try:
            stmt = stmt.where(Patient.created_at >= datetime.fromisoformat(created_from))
        except ValueError:
            pass
    if created_to:
        try:
            stmt = stmt.where(Patient.created_at <= datetime.fromisoformat(created_to))
        except ValueError:
            pass
    if revenue_min is not None:
        stmt = stmt.where(Patient.total_revenue >= revenue_min)
    if revenue_max is not None:
        stmt = stmt.where(Patient.total_revenue <= revenue_max)
    if visits_min is not None or visits_max is not None:
        from sqlalchemy import func as sqlfunc
        visit_count = (
            select(sqlfunc.count(Appointment.id))
            .where(Appointment.patient_id == Patient.id)
            .correlate(Patient)
            .scalar_subquery()
        )
        if visits_min is not None:
            stmt = stmt.where(visit_count >= visits_min)
        if visits_max is not None:
            stmt = stmt.where(visit_count <= visits_max)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(Patient.created_at.desc())
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    patients = result.scalars().all()

    items = [
        PatientResponse(
            id=p.id,
            external_id=p.external_id,
            name=p.name,
            phone=p.phone,
            email=p.email,
            birth_date=p.birth_date,
            source_channel=p.source_channel,
            is_new_patient=p.is_new_patient,
            last_visit_at=p.last_visit_at,
            total_revenue=float(p.total_revenue),
            ltv_score=p.ltv_score,
            tags=p.tags,
            created_at=p.created_at,
        )
        for p in patients
    ]

    return PatientListResponse(items=items, total=total)


async def get_patient_detail(
    patient_id: uuid.UUID, db: AsyncSession
) -> PatientDetailResponse | None:
    patient = await db.get(Patient, patient_id)
    if patient is None:
        return None

    appts_result = await db.execute(
        select(Appointment)
        .where(Appointment.patient_id == patient_id)
        .order_by(Appointment.scheduled_at.desc())
        .limit(50)
    )
    appointments = [
        AppointmentResponse(
            id=a.id,
            external_id=a.external_id,
            patient_id=a.patient_id,
            doctor_name=a.doctor_name,
            service=a.service,
            branch=a.branch,
            scheduled_at=a.scheduled_at,
            duration_min=a.duration_min,
            status=a.status,
            no_show_risk=a.no_show_risk,
            comment=a.comment,
            revenue=float(a.revenue) if a.revenue else None,
            created_at=a.created_at,
        )
        for a in appts_result.scalars().all()
    ]

    comms_result = await db.execute(
        select(Communication)
        .where(Communication.patient_id == patient_id)
        .order_by(Communication.created_at.desc())
        .limit(50)
    )
    communications = [
        CommunicationBrief(
            id=c.id,
            channel=c.channel,
            direction=c.direction,
            type=c.type,
            content=c.content,
            status=c.status,
            created_at=c.created_at,
        )
        for c in comms_result.scalars().all()
    ]

    deals_result = await db.execute(
        select(Deal)
        .where(Deal.patient_id == patient_id)
        .order_by(Deal.created_at.desc())
        .limit(50)
    )
    deals = [
        DealBrief(
            id=d.id,
            title=d.title,
            stage=d.stage,
            amount=float(d.amount) if d.amount else None,
            service=d.service,
            doctor_name=d.doctor_name,
            stage_changed_at=d.stage_changed_at,
            created_at=d.created_at,
        )
        for d in deals_result.scalars().all()
    ]

    tasks_result = await db.execute(
        select(Task)
        .where(Task.patient_id == patient_id)
        .order_by(Task.created_at.desc())
        .limit(50)
    )
    tasks = [
        TaskBrief(
            id=t.id,
            type=t.type,
            title=t.title,
            due_at=t.due_at,
            is_done=t.is_done,
            done_at=t.done_at,
            created_at=t.created_at,
        )
        for t in tasks_result.scalars().all()
    ]

    ai_analysis = AIAnalysis(
        summary="Анализ пациента будет доступен после накопления данных.",
        barriers=[],
        return_probability=0,
        next_action="Нет рекомендаций",
    )

    # Compute stats from appointments
    completed = [a for a in appointments if a.status == "completed"]
    cancelled = [a for a in appointments if a.status == "cancelled"]
    no_shows = [a for a in appointments if a.status == "no_show"]
    revenues = [a.revenue for a in appointments if a.revenue is not None]
    total_rev = sum(revenues)
    dates = sorted([a.scheduled_at for a in appointments if a.scheduled_at is not None])
    stats = PatientStats(
        total_visits=len(appointments),
        completed_visits=len(completed),
        cancelled_visits=len(cancelled),
        no_show_visits=len(no_shows),
        total_revenue=total_rev,
        avg_revenue_per_visit=round(total_rev / len(revenues), 2) if revenues else 0.0,
        first_visit_at=dates[0] if dates else None,
        last_visit_at=dates[-1] if dates else None,
        unique_doctors=len({a.doctor_name for a in appointments if a.doctor_name}),
        unique_services=len({a.service for a in appointments if a.service}),
    )

    return PatientDetailResponse(
        id=patient.id,
        external_id=patient.external_id,
        name=patient.name,
        phone=patient.phone,
        email=patient.email,
        birth_date=patient.birth_date,
        source_channel=patient.source_channel,
        is_new_patient=patient.is_new_patient,
        last_visit_at=patient.last_visit_at,
        total_revenue=float(patient.total_revenue),
        ltv_score=patient.ltv_score,
        tags=patient.tags,
        created_at=patient.created_at,
        appointments=appointments,
        communications=communications,
        deals=deals,
        tasks=tasks,
        ai_analysis=ai_analysis,
        stats=stats,
        raw_1denta_data=patient.raw_1denta_data,
    )


async def create_patient(
    db: AsyncSession,
    name: str,
    phone: str | None = None,
    email: str | None = None,
    birth_date: str | None = None,
    source_channel: str | None = None,
    tags: list[str] | None = None,
) -> PatientResponse:
    patient = Patient(
        name=name,
        phone=phone,
        email=email,
        source_channel=source_channel,
        is_new_patient=True,
        tags=tags,
    )
    if birth_date:
        try:
            from datetime import date as date_type
            patient.birth_date = date_type.fromisoformat(birth_date)
        except ValueError:
            pass
    db.add(patient)
    await db.flush()

    return PatientResponse(
        id=patient.id,
        external_id=patient.external_id,
        name=patient.name,
        phone=patient.phone,
        email=patient.email,
        birth_date=patient.birth_date,
        source_channel=patient.source_channel,
        is_new_patient=patient.is_new_patient,
        last_visit_at=patient.last_visit_at,
        total_revenue=float(patient.total_revenue),
        ltv_score=patient.ltv_score,
        tags=patient.tags,
        created_at=patient.created_at,
    )


async def update_patient(
    db: AsyncSession,
    patient_id: uuid.UUID,
    name: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    birth_date: str | None = None,
    source_channel: str | None = None,
    tags: list[str] | None = None,
    ltv_score: int | None = None,
) -> PatientResponse | None:
    patient = await db.get(Patient, patient_id)
    if patient is None:
        return None

    if name is not None:
        patient.name = name
    if phone is not None:
        patient.phone = phone
    if email is not None:
        patient.email = email
    if birth_date is not None:
        try:
            from datetime import date as date_type
            patient.birth_date = date_type.fromisoformat(birth_date)
        except ValueError:
            pass
    if source_channel is not None:
        patient.source_channel = source_channel
    if tags is not None:
        patient.tags = tags
    if ltv_score is not None:
        patient.ltv_score = ltv_score

    await db.flush()

    return PatientResponse(
        id=patient.id,
        external_id=patient.external_id,
        name=patient.name,
        phone=patient.phone,
        email=patient.email,
        birth_date=patient.birth_date,
        source_channel=patient.source_channel,
        is_new_patient=patient.is_new_patient,
        last_visit_at=patient.last_visit_at,
        total_revenue=float(patient.total_revenue),
        ltv_score=patient.ltv_score,
        tags=patient.tags,
        created_at=patient.created_at,
    )
