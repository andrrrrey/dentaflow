import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  comment: string | null;
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

export interface PatientStats {
  total_visits: number;
  completed_visits: number;
  cancelled_visits: number;
  no_show_visits: number;
  total_revenue: number;
  avg_revenue_per_visit: number;
  first_visit_at: string | null;
  last_visit_at: string | null;
  unique_doctors: number;
  unique_services: number;
}

export interface PatientDetailResponse extends PatientResponse {
  appointments: AppointmentResponse[];
  communications: CommunicationBrief[];
  deals: DealBrief[];
  tasks: TaskBrief[];
  ai_analysis: AIAnalysis;
  stats: PatientStats;
  raw_1denta_data: Record<string, unknown> | null;
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

export function useSyncPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patientId: string) => {
      const { data } = await api.post(`/patients/${patientId}/sync-1denta`);
      return data as { ok: boolean; synced: number; created: number; updated: number; message?: string };
    },
    onSuccess: (_data, patientId) => {
      qc.invalidateQueries({ queryKey: ["patient", patientId] });
    },
  });
}

export interface PatientFilters {
  search?: string;
  visited?: string;
  gender?: string;
  patient_type?: string;
  source_channel?: string;
  birth_date_from?: string;
  birth_date_to?: string;
  last_visit_from?: string;
  last_visit_to?: string;
  created_from?: string;
  created_to?: string;
  revenue_min?: number;
  revenue_max?: number;
  visits_min?: number;
  visits_max?: number;
}

export function usePatients(filters: PatientFilters, page = 1, limit = 20) {
  const { data = null, isLoading } = useQuery<PatientListResponse>({
    queryKey: ["patients", filters, page, limit],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, limit };
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== "" && v !== null) params[k] = v;
      });
      const { data } = await api.get("/patients/", { params });
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 5 * 60 * 1000,
  });

  return { data, isLoading };
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patientId: string) => {
      await api.delete(`/patients/${patientId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function usePatientSearch(search: string) {
  return useQuery<PatientListResponse>({
    queryKey: ["patients-search", search],
    queryFn: async () => {
      const { data } = await api.get("/patients/", { params: { search, limit: 8 } });
      return data;
    },
    enabled: search.length >= 2,
    staleTime: 10_000,
  });
}
