"""
Seed-скрипт для создания начальных пользователей.

Запуск:
    python -m app.utils.seed

Создаёт:
    - owner@dentaflow.ru / admin123  (роль: owner)
    - admin@dentaflow.ru / admin123  (роль: admin)
"""

import asyncio
import sys

from sqlalchemy import select

from app.database import async_session_factory
from app.models.user import User
from app.utils.security import hash_password

# ── Начальные пользователи ────────────────────────────────────────────

SEED_USERS = [
    {
        "email": "owner@dentaflow.ru",
        "name": "Owner",
        "role": "owner",
        "password": "admin123",
    },
    {
        "email": "admin@dentaflow.ru",
        "name": "Admin",
        "role": "admin",
        "password": "admin123",
    },
]


async def seed() -> None:
    """Создание начальных пользователей, если они ещё не существуют."""
    created = 0

    async with async_session_factory() as session:
        for user_data in SEED_USERS:
            result = await session.execute(
                select(User).where(User.email == user_data["email"])
            )
            existing = result.scalar_one_or_none()

            if existing is not None:
                print(f"[seed] Пользователь {user_data['email']} уже существует — пропуск.")
                continue

            user = User(
                email=user_data["email"],
                name=user_data["name"],
                role=user_data["role"],
                password_hash=hash_password(user_data["password"]),
                is_active=True,
            )
            session.add(user)
            await session.commit()
            created += 1
            print(
                f"[seed] Создан пользователь: {user_data['email']} / {user_data['password']} "
                f"(роль: {user_data['role']})"
            )

    print(f"[seed] Готово. Создано пользователей: {created}/{len(SEED_USERS)}.")


def main() -> None:
    """Точка входа для запуска через python -m app.utils.seed."""
    try:
        asyncio.run(seed())
    except Exception as exc:
        print(f"[seed] Ошибка: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
