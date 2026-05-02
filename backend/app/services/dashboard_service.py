from datetime import datetime, timedelta, timezone

from sqlalchemy import case, cast, func, select, Float
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment
from app.models.communication import Communication
from app.models.deal import Deal
from app.models.patient import Patient
from app.models.user import User
from app.schemas.dashboard import (
    AdminRating,
    AIInsights,
    DashboardOverview,
    DoctorLoad,
    FunnelItem,
    KpiData,
    SourceItem,
)


def _period_range(period: str) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, now


async def _kpi(db: AsyncSession, dt_from: datetime, dt_to: datetime) -> KpiData:
    new_leads = (await db.execute(
        select(func.count()).where(
            Patient.created_at >= dt_from, Patient.created_at <= dt_to, Patient.is_new_patient == True
        )
    )).scalar() or 0

    appts_created = (await db.execute(
        select(func.count()).where(
            Appointment.created_at >= dt_from, Appointment.created_at <= dt_to
        )
    )).scalar() or 0

    appts_confirmed = (await db.execute(
        select(func.count()).where(
            Appointment.scheduled_at >= dt_from, Appointment.scheduled_at <= dt_to,
            Appointment.status == "confirmed",
        )
    )).scalar() or 0

    no_shows = (await db.execute(
        select(func.count()).where(
            Appointment.scheduled_at >= dt_from, Appointment.scheduled_at <= dt_to,
            Appointment.status == "no_show",
        )
    )).scalar() or 0

    leads_lost = (await db.execute(
        select(func.count()).where(
            Deal.stage == "closed_lost",
            Deal.stage_changed_at >= dt_from, Deal.stage_changed_at <= dt_to,
        )
    )).scalar() or 0

    revenue = (await db.execute(
        select(func.coalesce(func.sum(Deal.amount), 0)).where(
            Deal.stage == "closed_won",
            Deal.closed_at >= dt_from, Deal.closed_at <= dt_to,
        )
    )).scalar() or 0

    total_leads = (await db.execute(
        select(func.count()).where(
            Deal.created_at >= dt_from, Deal.created_at <= dt_to
        )
    )).scalar() or 1

    won = (await db.execute(
        select(func.count()).where(
            Deal.stage == "closed_won",
            Deal.closed_at >= dt_from, Deal.closed_at <= dt_to,
        )
    )).scalar() or 0

    conversion = round(won / total_leads * 100, 1) if total_leads else 0

    return KpiData(
        new_leads=new_leads,
        appointments_created=appts_created,
        appointments_confirmed=appts_confirmed,
        no_shows=no_shows,
        leads_lost=leads_lost,
        revenue_planned=float(revenue),
        conversion_rate=conversion,
    )


async def _funnel(db: AsyncSession, dt_from: datetime, dt_to: datetime) -> list[FunnelItem]:
    # Show current deal counts by stage (no date filter — pipeline is a snapshot, not time-series)
    stages_order = [
        ("waiting_list", "Лист ожидания"),
        ("new", "Новые"),
        ("contact", "Контакт"),
        ("negotiation", "Переговоры"),
        ("scheduled", "Записан"),
        ("treatment", "Лечение"),
        ("closed_won", "Закрыто ✓"),
    ]

    stmt = (
        select(Deal.stage, func.count().label("cnt"))
        .where(Deal.stage.in_([s for s, _ in stages_order]))
        .group_by(Deal.stage)
    )
    rows = {row.stage: row.cnt for row in (await db.execute(stmt)).all()}

    counts = {key: rows.get(key, 0) for key, _ in stages_order}
    top = max(counts.values(), default=1) or 1
    return [
        FunnelItem(stage=label, count=counts[key], pct=round(counts[key] / top * 100, 1))
        for key, label in stages_order
        if counts[key] > 0
    ]


async def _sources(db: AsyncSession, dt_from: datetime, dt_to: datetime) -> list[SourceItem]:
    channel_labels = {
        "telegram": "Telegram",
        "novofon": "Телефония",
        "site": "Сайт",
        "max": "VK / Реклама",
        "referral": "Рекомендации",
        "call": "Телефония",
    }

    stmt = (
        select(
            Patient.source_channel,
            func.count().label("cnt"),
        )
        .where(Patient.created_at >= dt_from, Patient.created_at <= dt_to)
        .group_by(Patient.source_channel)
        .order_by(func.count().desc())
    )
    rows = (await db.execute(stmt)).all()

    items: list[SourceItem] = []
    for row in rows:
        channel = row.source_channel or "unknown"
        label = channel_labels.get(channel, channel.capitalize())

        total_deals = (await db.execute(
            select(func.count()).select_from(Deal).join(Patient, Deal.patient_id == Patient.id).where(
                Patient.source_channel == channel,
                Deal.created_at >= dt_from,
            )
        )).scalar() or 0

        won_deals = (await db.execute(
            select(func.count()).select_from(Deal).join(Patient, Deal.patient_id == Patient.id).where(
                Patient.source_channel == channel,
                Deal.stage == "closed_won",
                Deal.created_at >= dt_from,
            )
        )).scalar() or 0

        conv = round(won_deals / total_deals * 100, 1) if total_deals else 0
        items.append(SourceItem(channel=label, leads=row.cnt, conversion=conv, cpl=0))

    return items


async def _doctors_load(db: AsyncSession, dt_from: datetime, dt_to: datetime) -> list[DoctorLoad]:
    stmt = (
        select(
            Appointment.doctor_name,
            func.count().label("cnt"),
        )
        .where(
            Appointment.scheduled_at >= dt_from,
            Appointment.scheduled_at <= dt_to,
            Appointment.doctor_name.isnot(None),
        )
        .group_by(Appointment.doctor_name)
        .order_by(func.count().desc())
    )
    rows = (await db.execute(stmt)).all()

    if not rows:
        return []

    max_count = max(r.cnt for r in rows) or 1
    return [
        DoctorLoad(
            name=r.doctor_name or "",
            spec=f"{r.cnt} приёмов",
            load_pct=round(r.cnt / max_count * 100, 1),
        )
        for r in rows
    ]


async def _admins_rating(db: AsyncSession, dt_from: datetime, dt_to: datetime) -> list[AdminRating]:
    stmt = (
        select(
            User.name,
            func.count(Communication.id).label("calls"),
            func.count(case((Deal.stage == "closed_won", 1))).label("won"),
            func.count(Deal.id).label("total_deals"),
        )
        .select_from(User)
        .outerjoin(Communication, Communication.assigned_to == User.id)
        .outerjoin(Deal, Deal.assigned_to == User.id)
        .where(User.role.in_(["admin", "manager"]))
        .group_by(User.id, User.name)
        .having(func.count(Communication.id) > 0)
        .order_by(func.count(Communication.id).desc())
    )
    rows = (await db.execute(stmt)).all()

    return [
        AdminRating(
            name=r.name,
            conversion=round(r.won / r.total_deals * 100, 1) if r.total_deals else 0,
            calls=r.calls,
            score=round(min((r.won / r.total_deals * 5) if r.total_deals else 0, 5.0), 1),
        )
        for r in rows
    ]


def _fallback_ai_insights() -> AIInsights:
    return AIInsights(
        summary="Данные загружены из базы. ИИ-аналитика обновляется каждый час.",
        chips=[],
        recommendations=[],
    )


async def get_overview(period: str, db: AsyncSession) -> DashboardOverview:
    dt_from, dt_to = _period_range(period)

    kpi = await _kpi(db, dt_from, dt_to)
    funnel = await _funnel(db, dt_from, dt_to)
    sources = await _sources(db, dt_from, dt_to)
    doctors_load = await _doctors_load(db, dt_from, dt_to)
    admins_rating = await _admins_rating(db, dt_from, dt_to)

    return DashboardOverview(
        kpi=kpi,
        funnel=funnel,
        sources=sources,
        doctors_load=doctors_load,
        admins_rating=admins_rating,
        ai_insights=_fallback_ai_insights(),
    )
