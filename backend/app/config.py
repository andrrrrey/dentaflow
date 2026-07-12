from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_ENV: str = "production"
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
    # Bulk segment analysis (17k patients) — cheaper/faster model + parallelism.
    SEGMENT_AI_MODEL: str = "gpt-4o-mini"
    SEGMENT_AI_CONCURRENCY: int = 15

    MAX_API_KEY: str = ""
    MAX_CONFIRMATION_TOKEN: str = ""

    MAIL_HOST: str = ""
    MAIL_PORT: int = 465
    MAIL_USER: str = ""
    MAIL_PASSWORD: str = ""

    SITE_WEBHOOK_URL: str = ""

    # AI-обзвон (aicallrobot) — отдельный сервис, к которому проксирует бэкенд.
    AICALLROBOT_URL: str = "http://aicallrobot:8000"

    # Asterisk AMI (для Originate исходящих звонков ИИ-обзвона).
    AMI_HOST: str = "asterisk"
    AMI_PORT: int = 5038
    AMI_USERNAME: str = "dentaflow"
    AMI_PASSWORD: str = ""

    # Каталог с записями ИИ-звонков (общий том с Asterisk, MixMonitor пишет сюда
    # файлы aicall-<call_id>.wav). См. docker-compose (том aicall_recordings).
    AICALL_RECORDINGS_DIR: str = "/recordings"

    # Общий секрет для внутренних сервис-сервисных запросов внутри docker-сети
    # (например, entrypoint контейнера Asterisk тянет SIP-настройки Novofon из
    # админки). Наружу (через nginx) этот эндпоинт не публикуется.
    INTERNAL_API_TOKEN: str = ""

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    class Config:
        env_file = ".env"


settings = Settings()
