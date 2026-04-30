from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    ai,
    auth,
    calls,
    communications,
    dashboard,
    deals,
    directories,
    doctors,
    integrations,
    notifications,
    patients,
    pipeline_ext,
    reports,
    schedule,
    scripts,
    search,
    staff,
    tasks,
    ws,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup: add future initialization here (redis pools, bot webhooks, etc.)
    yield
    # Shutdown: add future cleanup here


app = FastAPI(
    title="DentaFlow API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check
@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


# --- Routers ---
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(deals.router)
app.include_router(communications.router)
app.include_router(patients.router)
app.include_router(ws.router)
app.include_router(tasks.router)
app.include_router(notifications.router)
app.include_router(schedule.router)
app.include_router(doctors.router)
app.include_router(calls.router)
app.include_router(pipeline_ext.router)
app.include_router(search.router)
app.include_router(ai.router)
app.include_router(staff.router)
app.include_router(integrations.router)
app.include_router(scripts.router)
app.include_router(directories.router)
app.include_router(reports.router)

# --- Future routers ---
# app.include_router(appointments.router, prefix="/api/v1/appointments", tags=["appointments"])
# app.include_router(calls.router, prefix="/api/v1/calls", tags=["calls"])
# app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
# app.include_router(telegram.router, prefix="/api/v1/telegram", tags=["telegram"])
