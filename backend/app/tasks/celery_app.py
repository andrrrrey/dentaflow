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

# Queue routing — worker listens on default,ai,sync; use "default" as the base queue
celery_app.conf.task_default_queue = "default"

# Serialisation
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]

# Timezone
celery_app.conf.timezone = "Europe/Moscow"
celery_app.conf.enable_utc = True

# Beat schedule
celery_app.conf.beat_schedule = {
    # Frequent: appointments for the near-term window (today ±2 weeks)
    "sync-1denta-appointments": {
        "task": "app.tasks.sync_1denta.sync_appointments",
        "schedule": 300.0,  # every 5 minutes
    },
    # Hourly: doctors / services directory
    "sync-1denta-directories": {
        "task": "app.tasks.sync_1denta.sync_directories",
        "schedule": 3600.0,  # every hour
    },
    # Nightly: full patient base + 90-day appointment history
    "sync-1denta-full-daily": {
        "task": "app.tasks.sync_1denta.sync_full_daily",
        "schedule": crontab(hour=3, minute=0),  # 03:00 Moscow (UTC, Celery uses Moscow tz)
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
    "send-appointment-reminders": {
        "task": "app.tasks.bot_reminders.send_appointment_reminders",
        "schedule": 900.0,  # every 15 minutes
    },
    "create-daily-call-tasks": {
        "task": "app.tasks.auto_tasks.create_daily_call_tasks",
        "schedule": crontab(hour=7, minute=0),  # 07:00 Moscow
    },
    "deactivate-expired-tasks": {
        "task": "app.tasks.auto_tasks.deactivate_expired_tasks",
        "schedule": crontab(hour=0, minute=5),  # 00:05 Moscow
    },
    "create-yesterday-followup-tasks": {
        "task": "app.tasks.auto_tasks.create_yesterday_followup_tasks",
        "schedule": crontab(hour=8, minute=0),  # 08:00 Moscow
    },
}

# Explicitly include task modules (autodiscover only finds app/tasks/tasks.py, not submodules)
celery_app.conf.include = [
    "app.tasks.sync_1denta",
    "app.tasks.alerts",
    "app.tasks.ai_insights",
    "app.tasks.daily_report",
    "app.tasks.bot_reminders",
    "app.tasks.auto_tasks",
]

# Remove legacy patients-only periodic sync (now part of sync_full_daily)
# "sync-1denta-patients" intentionally omitted — patients sync runs nightly.
