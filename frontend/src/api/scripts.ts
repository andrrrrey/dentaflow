import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface ScriptItem {
  id: string;
  name: string;
  content: string;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScriptAnalysis {
  score: number;
  completeness: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export interface CallComparison {
  compliance_pct: number;
  completed_steps: string[];
  missed_steps: string[];
  deviations: string[];
  recommendations: string[];
}

export function useScripts() {
  return useQuery<{ scripts: ScriptItem[] }>({
    queryKey: ["scripts"],
    queryFn: async () => {
      const { data } = await api.get("/scripts/");
      return data;
    },
    staleTime: 30 * 1000,
  });
}

export function useCreateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; content: string; category?: string }) => {
      const { data: result } = await api.post("/scripts/", data);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
    },
  });
}

export function useDeleteScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scriptId: string) => {
      await api.delete(`/scripts/${scriptId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
    },
  });
}

export function useAnalyzeScript() {
  return useMutation<{ script_id: string; analysis: ScriptAnalysis }, Error, string>({
    mutationFn: async (scriptId: string) => {
      const { data } = await api.post(`/scripts/${scriptId}/analyze`);
      return data;
    },
  });
}

export function useCompareCallWithScript() {
  return useMutation<{ script_id: string; comparison: CallComparison }, Error, { script_id: string; transcript: string }>({
    mutationFn: async (body) => {
      const { data } = await api.post("/scripts/compare-call", body);
      return data;
    },
  });
}
