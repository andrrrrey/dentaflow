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

# Route the long-running base-analysis recompute onto its own queue so a
# dedicated worker handles it. Otherwise the single prefork worker is saturated
# by the nightly full sync (~150s) and the every-5-min appointment sync, which
# starves the segment recompute and leaves lists stuck "queued".
celery_app.conf.task_routes = {
    "app.tasks.segments.*": {"queue": "segments"},
    "app.tasks.ai_calling.*": {"queue": "ai"},
}

# Serialisation
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]

# Timezone
celery_app.conf.timezone = "Europe/Moscow"
celery_app.conf.enable_utc = True

# Beat schedule
celery_app.conf.beat_schedule = {
    # Hourly combined sync: directories (doctors/services) + patients +
    # near-term appointments through one 1Denta login. Replaces the former
    # every-5-min appointment sync and the separate hourly directories sync —
    # the every-5-min cadence across ~8 processes was tripping 1Denta's login
    # throttle (HTTP 423 "account temporarily blocked").
    "sync-1denta-hourly": {
        "task": "app.tasks.sync_1denta.sync_hourly",
        "schedule": 3600.0,  # every hour
    },
    # Nightly: full sync with 1Denta + Novofon across all sections —
    # Справочники, Пациенты, Расписание, Контроль звонков, Маркетинг
    "sync-1denta-full-daily": {
        "task": "app.tasks.sync_1denta.sync_full_daily",
        "schedule": crontab(hour=2, minute=30),  # 02:30 Moscow — before 03:00 task generation
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
    # Clinic is in Ulan-Ude (MSK+5): 03:00 Moscow = 08:00 local, i.e. the
    # confirmation-call tasks for tomorrow's appointments are ready right when
    # the clinic opens, leaving the admin the whole day to call patients.
    "create-daily-call-tasks": {
        "task": "app.tasks.auto_tasks.create_daily_call_tasks",
        "schedule": crontab(hour=3, minute=0),  # 03:00 Moscow = 08:00 Улан-Удэ
    },
    "create-yesterday-followup-tasks": {
        "task": "app.tasks.auto_tasks.create_yesterday_followup_tasks",
        "schedule": crontab(hour=3, minute=5),  # 03:05 Moscow = 08:05 Улан-Удэ
    },
    # ИИ-обзвон: диспетчер кампаний (расписание/окна/слоты).
    "ai-calling-tick": {
        "task": "app.tasks.ai_calling.tick_campaigns",
        "schedule": 60.0,  # каждую минуту
    },
    "deactivate-expired-tasks": {
        "task": "app.tasks.auto_tasks.deactivate_expired_tasks",
        "schedule": crontab(hour=0, minute=5),  # 00:05 Moscow — before task generation
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
    "app.tasks.segments",
    "app.tasks.ai_calling",
]

# Remove legacy patients-only periodic sync (now part of sync_full_daily)
# "sync-1denta-patients" intentionally omitted — patients sync runs nightly.
