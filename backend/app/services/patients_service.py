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
        if patient_type == "other":
            known = ["noGroup", "new", "potential", "refuse", "refused"]
            stmt = stmt.where(Patient.patient_type.notin_(known))
        elif patient_type == "regular":
            stmt = stmt.where(Patient.patient_type == "noGroup")
        elif patient_type == "refused":
            stmt = stmt.where(Patient.patient_type.in_(["refuse", "refused"]))
        else:
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


def _build_ai_analysis(
    patient: Patient,
    appointments: list,
    completed: list,
    cancelled: list,
    no_shows: list,
    total_rev: float,
    dates: list,
) -> AIAnalysis:
    """Generate template-based AI analysis from real patient data."""
    now = datetime.now(timezone.utc)

    days_since_visit: int | None = None
    if dates:
        last = dates[-1]
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        days_since_visit = max(0, (now - last).days)

    total_visits = len(appointments)
    no_show_rate = len(no_shows) / total_visits if total_visits else 0
    cancel_rate = len(cancelled) / total_visits if total_visits else 0

    # --- Return probability ---
    prob = 60  # base
    if days_since_visit is not None:
        if days_since_visit < 30:
            prob += 25
        elif days_since_visit < 90:
            prob += 10
        elif days_since_visit < 180:
            prob -= 10
        elif days_since_visit < 365:
            prob -= 20
        else:
            prob -= 35
    if total_visits >= 5:
        prob += 10
    elif total_visits >= 2:
        prob += 5
    if no_show_rate > 0.3:
        prob -= 15
    if cancel_rate > 0.3:
        prob -= 10
    if total_rev > 50_000:
        prob += 5
    prob = max(5, min(97, prob))

    # --- Barriers ---
    barriers: list[str] = []
    if days_since_visit is not None and days_since_visit > 90:
        barriers.append(f"Не был в клинике {days_since_visit} дней")
    if no_show_rate > 0.2:
        barriers.append("Высокий процент неявок на записи")
    if cancel_rate > 0.3:
        barriers.append("Часто отменяет визиты")
    if total_visits == 0:
        barriers.append("Нет истории визитов")
    if not barriers:
        if total_visits < 2:
            barriers.append("Новый пациент — ещё не сформирована привязанность к клинике")
        else:
            barriers.append("Барьеры не выявлены — пациент лоялен")

    # --- Summary ---
    if total_visits == 0:
        summary = f"Новый пациент {patient.name}. Данных о визитах пока нет."
    elif days_since_visit is not None and days_since_visit > 180:
        summary = (
            f"Пациент не посещал клинику более {days_since_visit // 30} месяцев. "
            f"Всего визитов: {total_visits}, выручка: {int(total_rev):,} ₽. Требуется реактивация."
        )
    elif days_since_visit is not None and days_since_visit < 30:
        summary = (
            f"Активный пациент: был в клинике {days_since_visit} дн. назад. "
            f"Всего визитов: {total_visits}, выручка: {int(total_rev):,} ₽."
        )
    else:
        summary = (
            f"Пациент с {total_visits} визит(ами), выручка {int(total_rev):,} ₽. "
            f"Последний визит: {days_since_visit} дн. назад."
        )

    # --- Next action ---
    if total_visits == 0:
        next_action = "Позвонить и предложить первичную консультацию"
    elif days_since_visit is not None and days_since_visit > 365:
        next_action = "Отправить персональное предложение — пациент давно не посещал клинику"
    elif days_since_visit is not None and days_since_visit > 90:
        next_action = f"Позвонить и предложить профилактический осмотр (не был {days_since_visit} дней)"
    elif no_show_rate > 0.3:
        next_action = "Выяснить причины неявок, предложить удобное время"
    else:
        next_action = "Напомнить о плановом осмотре или предложить дополнительную услугу"

    return AIAnalysis(
        summary=summary,
        barriers=barriers,
        return_probability=prob,
        next_action=next_action,
    )


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

    # Compute stats from appointments
    completed = [a for a in appointments if a.status == "completed"]
    cancelled = [a for a in appointments if a.status == "cancelled"]
    no_shows = [a for a in appointments if a.status == "no_show"]
    revenues = [a.revenue for a in appointments if a.revenue is not None]
    total_rev = sum(revenues)
    dates = sorted([a.scheduled_at for a in appointments if a.scheduled_at is not None])

    ai_analysis = _build_ai_analysis(patient, appointments, completed, cancelled, no_shows, total_rev, dates)
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
