import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/* -- Types -- */

export interface DealResponse {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  title: string;
  stage: string;
  amount: number | null;
  service: string | null;
  doctor_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  source_channel: string | null;
  notes: string | null;
  lost_reason: string | null;
  stage_changed_at: string;
  created_at: string;
}

export interface StageColumn {
  stage: string;
  label: string;
  deals: DealResponse[];
  count: number;
  total_amount: number;
}

export interface PipelineResponse {
  stages: StageColumn[];
  total_pipeline_value: number;
}

export interface StageHistoryEntry {
  id: string;
  deal_id: string;
  from_stage: string | null;
  to_stage: string | null;
  changed_by: string | null;
  comment: string | null;
  created_at: string;
}

export interface DealNote {
  id: string;
  deal_id: string;
  text: string;
  author_name: string | null;
  created_at: string;
}

export interface DealCreateData {
  title: string;
  patient_id?: string;
  patient_name?: string;
  patient_phone?: string;
  stage?: string;
  amount?: number;
  service?: string;
  doctor_name?: string;
  source_channel?: string;
  assigned_to?: string;
  notes?: string;
}

export interface DealUpdateData {
  stage?: string;
  amount?: number;
  notes?: string;
  lost_reason?: string;
  title?: string;
  service?: string;
  doctor_name?: string;
  assigned_to?: string;
  source_channel?: string;
}

/* -- Stage config -- */

export const STAGES: { key: string; label: string }[] = [
  { key: "new", label: "Новые" },
  { key: "contact", label: "Контакт" },
  { key: "negotiation", label: "Переговоры" },
  { key: "scheduled", label: "Записан" },
  { key: "treatment", label: "Лечение" },
  { key: "closed_won", label: "Закрыто ✓" },
  { key: "closed_lost", label: "Закрыто ✗" },
];

/* -- Hooks -- */

export function usePipelineQuery(params: { stage?: string; assigned_to?: string } = {}) {
  return useQuery<PipelineResponse>({
    queryKey: ["pipeline", params],
    queryFn: async () => {
      const { data } = await api.get("/deals/", { params });
      return data;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: DealCreateData) => {
      const { data: result } = await api.post("/deals/", data);
      return result as DealResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, data }: { dealId: string; data: DealUpdateData }) => {
      const { data: result } = await api.patch(`/deals/${dealId}`, data);
      return result as DealResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dealId: string) => {
      await api.delete(`/deals/${dealId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function useMoveDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, stage }: { dealId: string; stage: string }) => {
      const { data } = await api.patch(`/deals/${dealId}`, { stage });
      return data as DealResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function useDealHistory(dealId: string | null) {
  return useQuery<StageHistoryEntry[]>({
    queryKey: ["deal-history", dealId],
    queryFn: async () => {
      const { data } = await api.get(`/deals/${dealId}/history`);
      return data;
    },
    enabled: !!dealId,
  });
}

export function useDealNotes(dealId: string | null) {
  return useQuery<DealNote[]>({
    queryKey: ["deal-notes", dealId],
    queryFn: async () => {
      const { data } = await api.get(`/deals/${dealId}/notes`);
      return data;
    },
    enabled: !!dealId,
  });
}

export function useAddDealNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, text }: { dealId: string; text: string }) => {
      const { data } = await api.post(`/deals/${dealId}/notes`, { text });
      return data as DealNote;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["deal-notes", vars.dealId] });
    },
  });
}
