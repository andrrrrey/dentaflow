from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, role_required
from app.models.user import User
from app.schemas.rewards import (
    AwardPointsRequest,
    LeaderboardResponse,
    PointsEntry,
    RewardsConfig,
)
from app.services.rewards_service import (
    award_points_manual,
    get_config,
    get_history,
    get_leaderboard,
    save_config,
)

router = APIRouter(prefix="/api/v1/rewards", tags=["rewards"])


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> LeaderboardResponse:
    return await get_leaderboard(db=db)


@router.get("/history", response_model=list[PointsEntry])
async def my_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PointsEntry]:
    return await get_history(db=db, user_id=current_user.id)


@router.get("/config", response_model=RewardsConfig)
async def rewards_config(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> RewardsConfig:
    return await get_config(db=db)


@router.put("/config", response_model=RewardsConfig)
async def update_rewards_config(
    body: RewardsConfig,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(role_required("owner", "manager")),
) -> RewardsConfig:
    return await save_config(db=db, config=body)


@router.post("/award", response_model=PointsEntry)
async def award_points_endpoint(
    body: AwardPointsRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(role_required("owner", "manager")),
) -> PointsEntry:
    if body.points <= 0:
        raise HTTPException(status_code=400, detail="Points must be positive")
    result = await award_points_manual(
        db=db,
        user_id=body.user_id,
        action_type=body.action_type,
        points=body.points,
        description=body.description,
    )
    return result
