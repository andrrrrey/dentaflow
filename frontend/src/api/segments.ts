import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/* ── Types ─────────────────────────────────────────────── */

export interface Segment {
  id: string;
  key: string;
  name: string;
  description: string | null;
  kind: string; // dynamic_ai | dynamic_sql | manual
  status: string; // idle | queued | running | done | error
  progress: number;
  processed: number;
  total: number;
  member_count: number;
  computed_at: string | null;
  error: string | null;
}

export interface SegmentMember {
  patient_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  last_visit_at: string | null;
  total_revenue: number;
  reason: string | null;
  added_at: string;
}

/* ── Hooks ─────────────────────────────────────────────── */

export function useSegments() {
  return useQuery<{ items: Segment[] }>({
    queryKey: ["segments"],
    queryFn: async () => (await api.get("/patient-segments/")).data,
    // Poll while any segment is being (re)computed so the progress bar is live.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((s) => s.status === "queued" || s.status === "running")
        ? 2000
        : false;
    },
  });
}

export function useSegmentMembers(key: string | null, page: number, limit = 50) {
  return useQuery<{ items: SegmentMember[]; total: number }>({
    queryKey: ["segment-members", key, page, limit],
    queryFn: async () =>
      (await api.get(`/patient-segments/${key}/members`, { params: { page, limit } }))
        .data,
    enabled: !!key,
  });
}

export function useRecomputeSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) =>
      (await api.post(`/patient-segments/${key}/recompute`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["segments"] }),
  });
}

export function useAddSegmentMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, patientIds }: { key: string; patientIds: string[] }) =>
      (await api.post(`/patient-segments/${key}/members`, { patient_ids: patientIds }))
        .data,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["segments"] });
      qc.invalidateQueries({ queryKey: ["segment-members", v.key] });
    },
  });
}

export function useRemoveSegmentMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, patientId }: { key: string; patientId: string }) =>
      (await api.delete(`/patient-segments/${key}/members/${patientId}`)).data,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["segments"] });
      qc.invalidateQueries({ queryKey: ["segment-members", v.key] });
    },
  });
}

export async function downloadSegmentExcel(key: string, filename: string) {
  const res = await api.get(`/patient-segments/${key}/export`, {
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
