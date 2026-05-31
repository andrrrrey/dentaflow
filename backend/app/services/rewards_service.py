"""Rewards service — points ledger and leaderboard logic."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_points import AdminPoints
from app.models.user import User
from app.schemas.rewards import LeaderboardEntry, LeaderboardResponse, PointsEntry, RewardsConfig

_SETTINGS_KEY = "rewards_config"

_DEFAULTS: dict[str, int] = {
    "task_completed": 10,
    "call_made": 5,
    "script_compliance": 15,
    "appointment_confirmed": 20,
    "patient_reached": 8,
}


async def get_config(db: AsyncSession) -> RewardsConfig:
    from app.models.integration_setting import IntegrationSetting

    row = await db.execute(
        select(IntegrationSetting).where(IntegrationSetting.key == _SETTINGS_KEY)
    )
    setting = row.scalar_one_or_none()
    if setting and setting.value:
        try:
            data = json.loads(setting.value)
            merged = {**_DEFAULTS, **{k: int(v) for k, v in data.items() if k in _DEFAULTS}}
            return RewardsConfig(**merged)
        except (json.JSONDecodeError, ValueError):
            pass
    return RewardsConfig(**_DEFAULTS)


async def save_config(db: AsyncSession, config: RewardsConfig) -> RewardsConfig:
    from app.models.integration_setting import IntegrationSetting

    row = await db.execute(
        select(IntegrationSetting).where(IntegrationSetting.key == _SETTINGS_KEY)
    )
    setting = row.scalar_one_or_none()
    value = json.dumps(config.model_dump())
    if setting:
        setting.value = value
    else:
        db.add(IntegrationSetting(key=_SETTINGS_KEY, value=value))
    await db.commit()
    return config


async def award_points(
    db: AsyncSession,
    user_id: uuid.UUID,
    action_type: str,
    task_id: uuid.UUID | None = None,
    description: str | None = None,
) -> PointsEntry | None:
    config = await get_config(db)
    points_value = config.model_dump().get(action_type, 0)
    if points_value <= 0:
        return None

    entry = AdminPoints(
        user_id=user_id,
        action_type=action_type,
        points=points_value,
        task_id=task_id,
        description=description,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    user = await db.get(User, user_id)
    return PointsEntry(
        id=entry.id,
        user_id=entry.user_id,
        user_name=user.name if user else None,
        action_type=entry.action_type,
        points=entry.points,
        task_id=entry.task_id,
        description=entry.description,
        created_at=entry.created_at,
    )


async def award_points_manual(
    db: AsyncSession,
    user_id: uuid.UUID,
    action_type: str,
    points: int,
    description: str | None = None,
) -> PointsEntry:
    entry = AdminPoints(
        user_id=user_id,
        action_type=action_type,
        points=points,
        description=description,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    user = await db.get(User, user_id)
    return PointsEntry(
        id=entry.id,
        user_id=entry.user_id,
        user_name=user.name if user else None,
        action_type=entry.action_type,
        points=entry.points,
        task_id=entry.task_id,
        description=entry.description,
        created_at=entry.created_at,
    )


async def get_leaderboard(db: AsyncSession) -> LeaderboardResponse:
    # Aggregate points per user
    agg_result = await db.execute(
        select(
            AdminPoints.user_id,
            func.sum(AdminPoints.points).label("total_points"),
            func.count(AdminPoints.id).filter(AdminPoints.action_type == "task_completed").label("tasks_completed"),
        ).group_by(AdminPoints.user_id)
    )
    rows = agg_result.all()

    if not rows:
        return LeaderboardResponse(items=[])

    user_ids = [r.user_id for r in rows]
    users_result = await db.execute(
        select(User.id, User.name, User.avatar_url).where(User.id.in_(user_ids))
    )
    users_map = {row.id: row for row in users_result.all()}

    entries = []
    for r in rows:
        user = users_map.get(r.user_id)
        if not user:
            continue
        entries.append(
            LeaderboardEntry(
                user_id=r.user_id,
                name=user.name,
                avatar_url=user.avatar_url,
                total_points=int(r.total_points or 0),
                tasks_completed=int(r.tasks_completed or 0),
                rank=0,
            )
        )

    entries.sort(key=lambda e: e.total_points, reverse=True)
    for i, entry in enumerate(entries):
        entry.rank = i + 1

    return LeaderboardResponse(items=entries)


async def get_history(db: AsyncSession, user_id: uuid.UUID) -> list[PointsEntry]:
    result = await db.execute(
        select(AdminPoints)
        .where(AdminPoints.user_id == user_id)
        .order_by(AdminPoints.created_at.desc())
        .limit(50)
    )
    rows = result.scalars().all()

    user = await db.get(User, user_id)
    user_name = user.name if user else None

    return [
        PointsEntry(
            id=r.id,
            user_id=r.user_id,
            user_name=user_name,
            action_type=r.action_type,
            points=r.points,
            task_id=r.task_id,
            description=r.description,
            created_at=r.created_at,
        )
        for r in rows
    ]
