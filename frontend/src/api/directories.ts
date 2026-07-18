import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface ServiceItem {
  id: number | string;
  name: string;
  categoryName?: string;
  price?: string;
  duration?: number;
  onlineRecord?: boolean;
  /** ID врачей (1Denta resources), которым услуга доступна в онлайн-записи */
  bookingResources?: string[];
  [key: string]: unknown;
}

export interface ResourceItem {
  id: number | string;
  name: string;
  description?: string;
  _placeholder?: boolean;
  [key: string]: unknown;
}

export interface CommodityItem {
  id: number | string;
  name: string;
  categoryName?: string;
  price?: string;
  [key: string]: unknown;
}

export interface DirectoriesResponse<T> {
  items: T[];
  synced_at: string | null;
  error?: string;
}

export function useServices() {
  return useQuery<{ services: ServiceItem[]; synced_at: string | null }>({
    queryKey: ["directories-services"],
    queryFn: async () => {
      const { data } = await api.get("/directories/services");
      if (!data.services?.length) {
        try {
          await api.post("/directories/sync");
          const { data: fresh } = await api.get("/directories/services");
          return fresh;
        } catch {
          // ignore sync errors, return empty
        }
      }
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useResources() {
  return useQuery<{ resources: ResourceItem[]; synced_at: string | null }>({
    queryKey: ["directories-resources"],
    queryFn: async () => {
      const { data } = await api.get("/directories/resources");
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useCommodities() {
  return useQuery<{ commodities: CommodityItem[]; synced_at: string | null }>({
    queryKey: ["directories-commodities"],
    queryFn: async () => {
      const { data } = await api.get("/directories/commodities");
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export interface SyncResult {
  ok: boolean;
  counts: Record<string, number>;
  errors: Record<string, string>;
  synced_at: string;
  error?: string;
}

export function useUpdateResourceName() {
  const qc = useQueryClient();
  return useMutation<{ external_id: string; name: string }, Error, { externalId: string; name: string }>({
    mutationFn: async ({ externalId, name }) => {
      const { data } = await api.patch(`/directories/resources/${externalId}`, { name });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["directories-resources"] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["doctors-list"] });
    },
  });
}

export function useSyncDirectories() {
  const qc = useQueryClient();
  return useMutation<SyncResult, Error>({
    mutationFn: async () => {
      const { data } = await api.post("/directories/sync");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["directories-services"] });
      qc.invalidateQueries({ queryKey: ["directories-resources"] });
      qc.invalidateQueries({ queryKey: ["directories-commodities"] });
    },
  });
}
