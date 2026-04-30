"""Staff management router.

CRUD operations for clinic staff (User model).
Only owners and managers can create / update / delete staff.
"""

from __future__ import annotations

import uuid

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
    email: EmailStr
    role: str  # owner|manager|admin|marketer
    password: str
    phone: str | None = None


class StaffUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    role: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class StaffResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


@router.get("/", response_model=dict)
async def list_staff(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(select(User).order_by(User.name))
    users = result.scalars().all()
    return {
        "staff": [
            {
                "id": str(u.id),
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
        "total": len(users),
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: StaffCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(role_required("owner", "manager")),
) -> dict:
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
        password_hash=hash_password(body.password),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role}


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
        user.email = body.email
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active

    await db.commit()
    return {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role, "is_active": user.is_active}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required("owner", "manager")),
) -> None:
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
