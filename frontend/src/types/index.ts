/* ── Dashboard types ────────────────────────────────────── */

export interface KpiData {
  new_leads: number;
  appointments_created: number;
  appointments_confirmed: number;
  no_shows: number;
  leads_lost: number;
  revenue_planned: number;
  conversion_rate: number;
  no_shows_delta: number;
  leads_lost_delta: number;
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

/* ── Communication types ───────────────────────────────── */

export interface CommunicationItem {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  channel: "telegram" | "novofon" | "max" | "site" | "manual";
  direction: "inbound" | "outbound";
  type: "message" | "call" | "form" | "missed_call";
  content: string | null;
  media_url: string | null;
  duration_sec: number | null;
  status: "new" | "in_progress" | "done" | "ignored";
  priority: "urgent" | "high" | "normal" | "low";
  ai_tags: string[] | null;
  ai_summary: string | null;
  ai_next_action: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface CommunicationListResponse {
  items: CommunicationItem[];
  total: number;
  unread_count: number;
}

export interface CommunicationFilters {
  status?: string;
  channel?: string;
  priority?: string;
}
