"""AI endpoints for dashboard insights and admin reply suggestions."""

from __future__ import annotations

import json
import logging
import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

INSIGHTS_CACHE_KEY = "ai:insights:latest"
INSIGHTS_TTL = 3600  # 1 hour


def _redis():
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


@router.get("/insights")
async def get_insights(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Return cached AI insights (refreshed hourly by Celery)."""
    try:
        r = _redis()
        cached = await r.get(INSIGHTS_CACHE_KEY)
        await r.aclose()
        if cached:
            return json.loads(cached)
    except Exception:
        logger.exception("Redis unavailable, falling back to live generation")

    from app.services.integrations_service import get_raw_value
    api_key = await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY
    ai = AIService(api_key=api_key)
    insights = await ai.generate_daily_insights(kpi={})
    return insights


@router.post("/insights/refresh")
async def refresh_insights(
    period: str = "week",
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Force-regenerate AI insights using real KPI data for the given period."""
    from app.services.dashboard_service import _kpi, _period_range
    from app.services.integrations_service import get_raw_value

    api_key = await get_raw_value(db, "openai_api_key") or settings.OPENAI_API_KEY

    dt_from, dt_to = _period_range(period)
    kpi = await _kpi(db, dt_from, dt_to)
    kpi_data = {
        "period": period,
        "new_leads": kpi.new_leads,
        "appointments": kpi.appointments_created,
        "confirmed": kpi.appointments_confirmed,
        "no_shows": kpi.no_shows,
        "revenue": kpi.revenue_planned,
        "conversion_rate": kpi.conversion_rate,
    }

    ai = AIService(api_key=api_key)
    insights = await ai.generate_daily_insights(kpi=kpi_data)

    try:
        r = _redis()
        await r.set(INSIGHTS_CACHE_KEY, json.dumps(insights), ex=INSIGHTS_TTL)
        await r.aclose()
    except Exception:
        pass

    return insights


@router.post("/patient/{patient_id}")
async def analyze_patient(
    patient_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Generate AI analysis for a specific patient."""
    from app.services.patients_service import get_patient_detail

    detail = await get_patient_detail(patient_id, db=db)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    patient_data = {
        "name": detail.name,
        "total_revenue": detail.total_revenue,
        "is_new_patient": detail.is_new_patient,
        "last_visit_at": detail.last_visit_at.isoformat() if detail.last_visit_at else None,
        "tags": detail.tags,
        "stats": detail.stats.model_dump() if detail.stats else {},
    }
    history = [
        {"service": a.service, "status": a.status, "date": a.scheduled_at.isoformat() if a.scheduled_at else None, "comment": a.comment}
        for a in (detail.appointments or [])[:20]
    ]

    ai = AIService()
    return await ai.analyze_patient(patient_data=patient_data, history=history)


@router.get("/reports/advice")
async def get_reports_advice(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Generate AI advice summary for the reports page."""
    ai = AIService()
    return await ai.generate_reports_advice(db=db)


class SuggestionRequest(BaseModel):
    channel: str
    patient_name: str | None = None
    patient_phone: str | None = None
    history: list[dict] = []
    last_message: str = ""
    context: str = ""


@router.post("/suggestion")
async def get_suggestion(
    body: SuggestionRequest,
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Generate AI reply suggestions for an admin handling a communication."""
    ai = AIService()
    ctx = {
        "channel": body.channel,
        "patient_name": body.patient_name,
        "patient_phone": body.patient_phone,
        "history": body.history,
        "last_message": body.last_message,
        "context": body.context,
    }
    suggestions = await ai.suggest_reply(context=ctx)
    return {"suggestions": suggestions}
