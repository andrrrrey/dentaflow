import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface IntegrationSettings {
  [key: string]: string;
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
