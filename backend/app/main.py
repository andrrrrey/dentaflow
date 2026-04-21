from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, communications, dashboard, deals, notifications, patients, tasks, ws


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

# --- Future routers ---
# app.include_router(appointments.router, prefix="/api/v1/appointments", tags=["appointments"])
# app.include_router(calls.router, prefix="/api/v1/calls", tags=["calls"])
# app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
# app.include_router(telegram.router, prefix="/api/v1/telegram", tags=["telegram"])
