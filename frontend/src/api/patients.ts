import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

/* ── Types ─────────────────────────────────────────────── */

export interface PatientResponse {
  id: string;
  external_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  source_channel: string | null;
  is_new_patient: boolean;
  last_visit_at: string | null;
  total_revenue: number;
  ltv_score: number | null;
  tags: string[] | null;
  created_at: string;
}

export interface AppointmentResponse {
  id: string;
  external_id: string | null;
  patient_id: string | null;
  doctor_name: string | null;
  service: string | null;
  branch: string | null;
  scheduled_at: string | null;
  duration_min: number;
  status: string | null;
  no_show_risk: number | null;
  revenue: number | null;
  created_at: string;
}

export interface CommunicationBrief {
  id: string;
  channel: string;
  direction: string;
  type: string;
  content: string | null;
  status: string;
  created_at: string;
}

export interface DealBrief {
  id: string;
  title: string;
  stage: string;
  amount: number | null;
  service: string | null;
  doctor_name: string | null;
  stage_changed_at: string;
  created_at: string;
}

export interface TaskBrief {
  id: string;
  type: string | null;
  title: string | null;
  due_at: string | null;
  is_done: boolean;
  done_at: string | null;
  created_at: string;
}

export interface AIAnalysis {
  summary: string;
  barriers: string[];
  return_probability: number;
  next_action: string;
}

export interface PatientDetailResponse extends PatientResponse {
  appointments: AppointmentResponse[];
  communications: CommunicationBrief[];
  deals: DealBrief[];
  tasks: TaskBrief[];
  ai_analysis: AIAnalysis;
}

export interface PatientListResponse {
  items: PatientResponse[];
  total: number;
}

/* ── Hooks ─────────────────────────────────────────────── */

export function usePatientDetail(id: string | undefined) {
  const { data = null, isLoading } = useQuery<PatientDetailResponse>({
    queryKey: ["patient", id],
    queryFn: async () => {
      const { data } = await api.get(`/patients/${id}`);
      return data;
    },
    enabled: !!id,
  });

  return { data, isLoading };
}

export function usePatients(search: string, page = 1, limit = 20) {
  const { data = null, isLoading } = useQuery<PatientListResponse>({
    queryKey: ["patients", search, page, limit],
    queryFn: async () => {
      const { data } = await api.get("/patients/", {
        params: { search: search || undefined, page, limit },
      });
      return data;
    },
    staleTime: 30_000,
  });

  return { data, isLoading };
}
