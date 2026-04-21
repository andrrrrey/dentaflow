from pydantic import BaseModel


class KpiData(BaseModel):
    new_leads: int
    appointments_created: int
    appointments_confirmed: int
    no_shows: int
    leads_lost: int
    revenue_planned: float
    conversion_rate: float


class FunnelItem(BaseModel):
    stage: str
    count: int
    pct: float


class SourceItem(BaseModel):
    channel: str
    leads: int
    conversion: float
    cpl: float


class DoctorLoad(BaseModel):
    name: str
    spec: str
    load_pct: float


class AdminRating(BaseModel):
    name: str
    conversion: float
    calls: int
    score: float


class AIInsights(BaseModel):
    summary: str
    chips: list[dict]  # {type, text, action}
    recommendations: list[dict]  # {title, body}


class DashboardOverview(BaseModel):
    kpi: KpiData
    funnel: list[FunnelItem]
    sources: list[SourceItem]
    doctors_load: list[DoctorLoad]
    admins_rating: list[AdminRating]
    ai_insights: AIInsights
