"""
Seed script to create the initial owner user.

Run:
    python -m app.utils.seed

Creates: owner@dentaflow.ru / admin123  (role=owner)
"""

import asyncio

from sqlalchemy import select

from app.database import async_session_factory
from app.models.user import User
from app.utils.security import hash_password

OWNER_EMAIL = "owner@dentaflow.ru"
OWNER_PASSWORD = "admin123"
OWNER_NAME = "Owner"
OWNER_ROLE = "owner"


async def seed() -> None:
    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(User.email == OWNER_EMAIL)
        )
        existing = result.scalar_one_or_none()

        if existing is not None:
            print(f"User {OWNER_EMAIL} already exists, skipping.")
            return

        user = User(
            email=OWNER_EMAIL,
            name=OWNER_NAME,
            role=OWNER_ROLE,
            password_hash=hash_password(OWNER_PASSWORD),
            is_active=True,
        )
        session.add(user)
        await session.commit()
        print(f"Created owner user: {OWNER_EMAIL} / {OWNER_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
