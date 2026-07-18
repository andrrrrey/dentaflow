import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface IntegrationSettings {
  [key: string]: string;
}

export interface KbFile {
  id: string;
  filename: string;
  size_bytes: number;
  created_at: string;
}

export function useIntegrations() {
  return useQuery<IntegrationSettings>({
    queryKey: ["integrations"],
    queryFn: async () => {
      const { data } = await api.get("/integrations/");
      return data.settings;
    },
    staleTime: 60 * 1000,
  });
}

export function useSaveIntegrations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: IntegrationSettings) => {
      const { data } = await api.put("/integrations/", { settings });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
}

export function useCheckIntegration() {
  return useMutation<{ ok: boolean; message: string }, Error, string>({
    mutationFn: async (service: string) => {
      const { data } = await api.post(`/integrations/check/${service}`);
      return data;
    },
  });
}

export function useSyncOneDenta() {
  return useMutation<{ status: string }, Error, void>({
    mutationFn: async () => {
      const { data } = await api.post("/integrations/sync-1denta");
      return data;
    },
  });
}

export interface OneDentaSyncCounts {
  created?: number;
  updated?: number;
  total?: number;
}

export interface OneDentaSyncStatus {
  last_sync_at: string | null;
  last_trigger: string | null;
  ok: boolean | null;
  error: string | null;
  result: {
    directories?: Record<string, number> | null;
    patients?: OneDentaSyncCounts | null;
    appointments?: OneDentaSyncCounts | null;
  } | null;
  next_sync_at: string | null;
  webhook_url?: string | null;
}

export function useRegisterOneDentaWebhook() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; webhook_url: string }, Error, void>({
    mutationFn: async () => {
      const { data } = await api.post("/integrations/sync-1denta/register-webhook");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["one-denta-sync-status"] });
    },
  });
}

export function useOneDentaSyncStatus() {
  return useQuery<OneDentaSyncStatus>({
    queryKey: ["one-denta-sync-status"],
    queryFn: async () => {
      const { data } = await api.get("/integrations/sync-1denta/status");
      return data;
    },
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });
}

// ---------- Knowledge Base ----------

export function useKnowledgeBaseFiles() {
  return useQuery<{ files: KbFile[] }>({
    queryKey: ["knowledge-base-files"],
    queryFn: async () => {
      const { data } = await api.get("/knowledge-base/");
      return data;
    },
    staleTime: 30 * 1000,
  });
}

export function useUploadKbFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/knowledge-base/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-base-files"] });
    },
  });
}

export function useDeleteKbFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/knowledge-base/${id}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-base-files"] });
    },
  });
}
