from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.schemas.dashboard import (
    AdminRating,
    AIInsights,
    DashboardOverview,
    DoctorLoad,
    FunnelItem,
    KpiData,
    SourceItem,
)


def _mock_kpi(period: str) -> KpiData:
    """Return realistic mock KPI for a dental clinic."""
    multipliers = {"day": 1, "week": 7, "month": 30}
    m = multipliers.get(period, 7)

    return KpiData(
        new_leads=round(6.5 * m),
        appointments_created=round(5.4 * m),
        appointments_confirmed=round(4.5 * m),
        no_shows=round(0.7 * m),
        leads_lost=round(0.9 * m),
        revenue_planned=round(170_000 * m, 2),
        conversion_rate=82.4,
    )


def _mock_funnel(period: str) -> list[FunnelItem]:
    multipliers = {"day": 1, "week": 7, "month": 30}
    m = multipliers.get(period, 7)

    stages = [
        ("Новые обращения", round(6.5 * m)),
        ("Контакт", round(5.8 * m)),
        ("Записан", round(5.4 * m)),
        ("Пришёл", round(4.5 * m)),
        ("Лечение", round(4.0 * m)),
        ("Оплата", round(3.8 * m)),
    ]
    top = stages[0][1] or 1
    return [
        FunnelItem(stage=stage, count=count, pct=round(count / top * 100, 1))
        for stage, count in stages
    ]


def _mock_sources() -> list[SourceItem]:
    return [
        SourceItem(channel="Telegram", leads=18, conversion=78.5, cpl=320.0),
        SourceItem(channel="Телефония", leads=12, conversion=85.0, cpl=540.0),
        SourceItem(channel="Сайт", leads=8, conversion=62.3, cpl=480.0),
        SourceItem(channel="VK / Реклама", leads=5, conversion=55.0, cpl=720.0),
        SourceItem(channel="Рекомендации", leads=3, conversion=91.0, cpl=0.0),
    ]


def _mock_doctors_load() -> list[DoctorLoad]:
    return [
        DoctorLoad(name="Иванова Е.А.", spec="Терапевт", load_pct=92.0),
        DoctorLoad(name="Петров С.В.", spec="Ортопед", load_pct=78.0),
        DoctorLoad(name="Сидорова М.К.", spec="Хирург", load_pct=65.0),
        DoctorLoad(name="Козлов Д.И.", spec="Ортодонт", load_pct=88.0),
        DoctorLoad(name="Новикова А.П.", spec="Терапевт", load_pct=54.0),
    ]


def _mock_admins_rating() -> list[AdminRating]:
    return [
        AdminRating(name="Ольга Смирнова", conversion=87.5, calls=124, score=4.8),
        AdminRating(name="Мария Волкова", conversion=79.2, calls=98, score=4.5),
        AdminRating(name="Анна Кузнецова", conversion=72.0, calls=86, score=4.2),
        AdminRating(name="Елена Морозова", conversion=68.3, calls=72, score=3.9),
    ]


def _mock_ai_insights() -> AIInsights:
    return AIInsights(
        summary=(
            "За неделю конверсия выросла на 3.2%. "
            "Telegram стал основным каналом привлечения. "
            "Рекомендуется увеличить слоты у доктора Ивановой — загрузка 92%."
        ),
        chips=[
            {"type": "ok", "text": "Конверсия +3.2%", "action": "funnel"},
            {"type": "warn", "text": "Загрузка 92% — Иванова", "action": "doctors"},
            {"type": "danger", "text": "5 неявок за неделю", "action": "no_shows"},
            {"type": "blue", "text": "Telegram — лидер", "action": "sources"},
        ],
        recommendations=[
            {
                "title": "Открыть доп. слоты у Ивановой Е.А.",
                "body": (
                    "Загрузка терапевта Ивановой достигла 92%. "
                    "Рекомендуется добавить вечерние слоты или "
                    "перенаправить часть пациентов к Новиковой (54%)."
                ),
            },
            {
                "title": "Усилить работу с неявками",
                "body": (
                    "5 неявок на этой неделе — на 40% больше нормы. "
                    "Настройте автоматическое напоминание за 2 часа до приёма "
                    "через Telegram."
                ),
            },
        ],
    )


async def get_overview(period: str, db: AsyncSession) -> DashboardOverview:
    """Return dashboard overview data.

    In development mode, returns realistic mock data.
    In production, this will query the database.
    """
    if settings.APP_ENV == "development":
        return DashboardOverview(
            kpi=_mock_kpi(period),
            funnel=_mock_funnel(period),
            sources=_mock_sources(),
            doctors_load=_mock_doctors_load(),
            admins_rating=_mock_admins_rating(),
            ai_insights=_mock_ai_insights(),
        )

    # Production: aggregate from real database tables
    # TODO: implement real queries against Patient, Deal, Appointment models
    return DashboardOverview(
        kpi=_mock_kpi(period),
        funnel=_mock_funnel(period),
        sources=_mock_sources(),
        doctors_load=_mock_doctors_load(),
        admins_rating=_mock_admins_rating(),
        ai_insights=_mock_ai_insights(),
    )
