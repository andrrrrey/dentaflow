"""Staff management router.

CRUD operations for clinic staff (User model).
Only owners and managers can create / update / delete staff.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, role_required
from app.models.user import User
from app.utils.security import hash_password

router = APIRouter(prefix="/api/v1/staff", tags=["staff"])


class StaffCreate(BaseModel):
    name: str
    # email и password необязательны — сотрудник может быть заведён без
    # возможности авторизации в системе.
    email: EmailStr | None = None
    role: str  # owner|manager|admin|marketer
    password: str | None = None
    phone: str | None = None
    birth_date: date | None = None


class StaffUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    role: str | None = None
    phone: str | None = None
    is_active: bool | None = None
    birth_date: date | None = None
    password: str | None = None


class StaffResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str | None
    role: str
    is_active: bool
    birth_date: date | None = None
    can_login: bool = False

    model_config = {"from_attributes": True}


def _serialize(u: User) -> dict:
    return {
        "id": str(u.id),
        "name": u.name,
        "email": u.email,
        "role": u.role,
        "is_active": u.is_active,
        "birth_date": u.birth_date.isoformat() if u.birth_date else None,
        "can_login": bool(u.password_hash),
        "created_at": u.created_at.isoformat(),
    }


@router.get("/", response_model=dict)
async def list_staff(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(select(User).order_by(User.name))
    users = result.scalars().all()
    return {
        "staff": [_serialize(u) for u in users],
        "total": len(users),
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: StaffCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(role_required("owner", "manager")),
) -> dict:
    # Проверяем дубликат только если email указан (email необязателен для
    # сотрудников без доступа в систему).
    if body.email:
        existing = await db.execute(select(User).where(User.email == body.email))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already in use",
            )

    user = User(
        name=body.name,
        email=body.email,
        role=body.role,
        # Нет пароля → нет возможности авторизации.
        password_hash=hash_password(body.password) if body.password else None,
        birth_date=body.birth_date,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _serialize(user)


@router.put("/{user_id}")
async def update_staff(
    user_id: uuid.UUID,
    body: StaffUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(role_required("owner", "manager")),
) -> dict:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.name is not None:
        user.name = body.name
    if body.email is not None:
        # Пустая строка → снять email (сотрудник без доступа), иначе проверить
        # уникальность среди других пользователей.
        new_email = body.email or None
        if new_email:
            dup = await db.execute(
                select(User).where(User.email == new_email, User.id != user.id)
            )
            if dup.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already in use",
                )
        user.email = new_email
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.birth_date is not None:
        user.birth_date = body.birth_date
    if body.password is not None and body.password.strip():
        user.password_hash = hash_password(body.password)

    await db.commit()
    await db.refresh(user)
    return _serialize(user)


@router.delete("/{user_id}")
async def delete_staff(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required("owner", "manager")),
) -> dict:
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself",
        )
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await db.delete(user)
    await db.commit()
    return {"detail": "Deleted"}
