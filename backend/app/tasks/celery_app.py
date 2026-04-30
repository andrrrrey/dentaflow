"""Celery application configuration for DentaFlow.

The broker and result backend both use Redis.  Beat schedule defines
periodic tasks for CRM sync, stale-lead checks and the nightly report.
"""

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery("dentaflow")

# Broker & backend
celery_app.conf.broker_url = settings.REDIS_URL
celery_app.conf.result_backend = settings.REDIS_URL

# Serialisation
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]

# Timezone
celery_app.conf.timezone = "Europe/Moscow"
celery_app.conf.enable_utc = True

# Beat schedule
celery_app.conf.beat_schedule = {
    "sync-1denta-patients": {
        "task": "app.tasks.sync_1denta.sync_patients",
        "schedule": 300.0,  # every 5 minutes
    },
    "sync-1denta-appointments": {
        "task": "app.tasks.sync_1denta.sync_appointments",
        "schedule": 300.0,  # every 5 minutes
    },
    "check-stale-leads": {
        "task": "app.tasks.alerts.check_stale_leads",
        "schedule": 300.0,  # every 5 minutes
    },
    "refresh-ai-insights": {
        "task": "app.tasks.ai_insights.refresh_insights",
        "schedule": 3600.0,  # every hour
    },
    "daily-report": {
        "task": "app.tasks.daily_report.send_daily_report",
        "schedule": crontab(hour=20, minute=0),  # 20:00 Moscow time
    },
}

# Explicitly include task modules (autodiscover only finds app/tasks/tasks.py, not submodules)
celery_app.conf.include = [
    "app.tasks.sync_1denta",
    "app.tasks.alerts",
    "app.tasks.ai_insights",
    "app.tasks.daily_report",
]
