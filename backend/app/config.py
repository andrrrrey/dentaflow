from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_ENV: str = "development"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    DATABASE_URL: str = "postgresql+asyncpg://dentaflow:dentaflow@postgres:5432/dentaflow"
    REDIS_URL: str = "redis://redis:6379/0"

    ONE_DENTA_API_URL: str = "https://crmexchange.1denta.ru"
    ONE_DENTA_EMAIL: str = ""
    ONE_DENTA_PASSWORD: str = ""

    NOVOFON_API_KEY: str = ""
    NOVOFON_WEBHOOK_SECRET: str = ""

    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""
    OWNER_TELEGRAM_CHAT_ID: str = ""

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    MAX_API_KEY: str = ""
    MAX_CONFIRMATION_TOKEN: str = ""

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    class Config:
        env_file = ".env"


settings = Settings()
