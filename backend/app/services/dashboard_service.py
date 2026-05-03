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


def _prev_period_range(period: str) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    if period == "day":
        prev = now - timedelta(days=1)
        start = prev.replace(hour=0, minute=0, second=0, microsecond=0)
        end = prev.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == "month":
        curr_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = curr_month_start - timedelta(microseconds=1)
        if now.month == 1:
            start = now.replace(year=now.year - 1, month=12, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            start = now.replace(month=now.month - 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:  # week
        curr_week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        end = curr_week_start - timedelta(microseconds=1)
        start = curr_week_start - timedelta(days=7)
    return start, end


def _period_range(period: str) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Last moment of current month
        if now.month == 12:
            next_month = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            next_month = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = next_month - timedelta(microseconds=1)
    else:  # week
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=6, hours=23, minutes=59, seconds=59, microseconds=999999)
    return start, end


async def _kpi(db: AsyncSession, dt_from: datetime, dt_to: datetime) -> KpiData:
    # New patients: those who had their first appointment in this period
    new_leads = (await db.execute(
        select(func.count()).where(
            Patient.created_at >= dt_from, Patient.created_at <= dt_to
        )
    )).scalar() or 0

    # Appointments: count by scheduled_at (when the visit actually happens, not import date)
    appts_created = (await db.execute(
        select(func.count()).where(
            Appointment.scheduled_at >= dt_from, Appointment.scheduled_at <= dt_to
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

    # Revenue from appointments (synced from 1Denta), not from Deal.amount
    revenue = (await db.execute(
        select(func.coalesce(func.sum(Appointment.revenue), 0)).where(
            Appointment.scheduled_at >= dt_from, Appointment.scheduled_at <= dt_to,
        )
    )).scalar() or 0

    # Conversion: appointments that resulted in arrived/completed vs total in period
    total_appts = appts_created or 1
    arrived = (await db.execute(
        select(func.count()).where(
            Appointment.scheduled_at >= dt_from, Appointment.scheduled_at <= dt_to,
            Appointment.status.in_(["arrived", "completed"]),
        )
    )).scalar() or 0

    conversion = round(arrived / total_appts * 100, 1) if total_appts else 0

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
    # Always use 30-day window so doctors are visible regardless of selected period
    window_from = dt_to - timedelta(days=30)
    query_from = min(dt_from, window_from)

    stmt = (
        select(
            Appointment.doctor_name,
            func.count().label("cnt"),
        )
        .where(
            Appointment.scheduled_at >= query_from,
            Appointment.scheduled_at <= dt_to,
            Appointment.doctor_name.isnot(None),
        )
        .group_by(Appointment.doctor_name)
        .order_by(func.count().desc())
    )
    rows = (await db.execute(stmt)).all()

    doctors_map: dict[str, int] = {}
    for r in rows:
        if r.doctor_name:
            doctors_map[r.doctor_name.lower()] = r.cnt

    # Merge doctors from directory_cache so all known doctors appear
    from sqlalchemy import text
    try:
        res = await db.execute(
            text(
                "SELECT name FROM directory_cache "
                "WHERE category = 'resource' AND name IS NOT NULL AND name != '' "
                "ORDER BY name LIMIT 100"
            )
        )
        for r in res.all():
            if r[0] and r[0].lower() not in doctors_map:
                doctors_map[r[0].lower()] = 0
    except Exception:
        pass

    if not doctors_map:
        return []

    max_count = max(doctors_map.values()) or 1
    items: list[DoctorLoad] = []
    for name_lower, cnt in sorted(doctors_map.items(), key=lambda x: -x[1]):
        original_name = next(
            (r.doctor_name for r in rows if r.doctor_name and r.doctor_name.lower() == name_lower),
            name_lower.title(),
        )
        items.append(DoctorLoad(
            name=original_name,
            spec=f"{cnt} приёмов",
            load_pct=round(cnt / max_count * 100, 1) if cnt > 0 else 0,
        ))

    return items


async def _admins_rating(db: AsyncSession, dt_from: datetime, dt_to: datetime) -> list[AdminRating]:
    # Query all admin/manager users
    users_stmt = select(User.id, User.name).where(
        User.role.in_(["admin", "manager"]),
        User.is_active.is_(True),
    )
    users = (await db.execute(users_stmt)).all()

    items: list[AdminRating] = []
    for user in users:
        # Count communications assigned to this user
        calls_count = (await db.execute(
            select(func.count(Communication.id)).where(Communication.assigned_to == user.id)
        )).scalar() or 0

        # Count deals assigned to this user
        total_deals = (await db.execute(
            select(func.count(Deal.id)).where(Deal.assigned_to == user.id)
        )).scalar() or 0

        won_deals = (await db.execute(
            select(func.count(Deal.id)).where(
                Deal.assigned_to == user.id,
                Deal.stage == "closed_won",
            )
        )).scalar() or 0

        conversion = round(won_deals / total_deals * 100, 1) if total_deals else 0
        score = round(min((won_deals / total_deals * 5) if total_deals else 3.0, 5.0), 1)

        items.append(AdminRating(
            name=user.name,
            conversion=conversion,
            calls=calls_count,
            score=score,
        ))

    items.sort(key=lambda x: x.calls, reverse=True)
    return items


def _fallback_ai_insights() -> AIInsights:
    return AIInsights(
        summary="Данные загружены из базы. ИИ-аналитика обновляется каждый час.",
        chips=[],
        recommendations=[],
    )


async def get_overview(period: str, db: AsyncSession) -> DashboardOverview:
    dt_from, dt_to = _period_range(period)
    prev_from, prev_to = _prev_period_range(period)

    kpi = await _kpi(db, dt_from, dt_to)
    prev_kpi = await _kpi(db, prev_from, prev_to)
    kpi.no_shows_delta = kpi.no_shows - prev_kpi.no_shows
    kpi.leads_lost_delta = kpi.leads_lost - prev_kpi.leads_lost
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
