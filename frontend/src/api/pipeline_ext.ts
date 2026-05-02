import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  pct: number;
}

export interface LeadSource {
  source: string;
  leads: number;
  conversion: number;
  cpl: number | null;
  quality: string;
}

export interface FunnelResponse {
  stages: FunnelStage[];
  overall_conversion: number;
  sources: LeadSource[];
}

export interface PatientsByStage {
  stage: string;
  total: number;
  page: number;
  patients: {
    id: string;
    external_id: string | null;
    name: string;
    phone: string | null;
    email: string | null;
    is_new_patient: boolean;
    total_revenue: number;
    tags: string[];
    last_visit_at: string | null;
    source_channel: string | null;
  }[];
}

export function useFunnel() {
  return useQuery<FunnelResponse>({
    queryKey: ["pipeline-funnel"],
    queryFn: async () => {
      const { data } = await api.get("/pipeline/funnel");
      return data;
    },
    staleTime: 10 * 60 * 1000,   // Keep fresh for 10 minutes
    gcTime: 60 * 60 * 1000,       // Keep in cache for 1 hour across navigation
    refetchInterval: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function usePatientsByStage(stage: string | null) {
  return useQuery<PatientsByStage>({
    queryKey: ["pipeline-patients", stage],
    queryFn: async () => {
      const { data } = await api.get("/pipeline/patients", { params: { stage } });
      return data;
    },
    enabled: !!stage,
  });
}
