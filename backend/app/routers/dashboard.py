from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardOverview
from app.services.dashboard_service import get_overview

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/overview", response_model=DashboardOverview)
async def dashboard_overview(
    period: str = Query("week", regex="^(day|week|month)$"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> DashboardOverview:
    """Return aggregated dashboard overview data for the given period."""
    return await get_overview(period=period, db=db)
