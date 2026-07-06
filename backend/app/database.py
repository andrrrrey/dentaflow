from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=(settings.APP_ENV == "development"),
    pool_pre_ping=True,
    # Pool is per-process. With backend (x2 workers) + celery workers + beat +
    # telegram bot all sharing this image, large per-process pools quickly
    # exhaust postgres' max_connections (default 100). Keep it modest.
    pool_size=5,
    max_overflow=10,
    pool_recycle=1800,
    # Disable asyncpg's prepared-statement cache: after `alembic upgrade head`
    # alters a table, cached statements on pooled connections raise
    # InvalidCachedStatementError, which surfaces as intermittent DB errors.
    connect_args={"statement_cache_size": 0},
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
