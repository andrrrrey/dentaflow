/* ── Dashboard types ────────────────────────────────────── */

export interface KpiData {
  new_leads: number;
  appointments_created: number;
  appointments_confirmed: number;
  no_shows: number;
  leads_lost: number;
  revenue_planned: number;
  conversion_rate: number;
}

export interface FunnelItem {
  stage: string;
  count: number;
  pct: number;
}

export interface SourceItem {
  channel: string;
  leads: number;
  conversion: number;
  cpl: number;
}

export interface DoctorLoad {
  name: string;
  spec: string;
  load_pct: number;
}

export interface AdminRating {
  name: string;
  conversion: number;
  calls: number;
  score: number;
}

export interface AIChip {
  type: "ok" | "warn" | "danger" | "blue";
  text: string;
  action: string;
}

export interface AIRecommendation {
  title: string;
  body: string;
}

export interface AIInsights {
  summary: string;
  chips: AIChip[];
  recommendations: AIRecommendation[];
}

export interface DashboardOverview {
  kpi: KpiData;
  funnel: FunnelItem[];
  sources: SourceItem[];
  doctors_load: DoctorLoad[];
  admins_rating: AdminRating[];
  ai_insights: AIInsights;
}
