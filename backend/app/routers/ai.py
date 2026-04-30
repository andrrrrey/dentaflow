"""AI endpoints for dashboard insights and admin reply suggestions."""

from __future__ import annotations

import json
import logging

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings
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

    # Fallback: generate on the fly with mock/live KPI
    ai = AIService()
    insights = await ai.generate_daily_insights(kpi={})
    return insights


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
