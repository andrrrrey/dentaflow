import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface ServiceItem {
  id: number | string;
  name: string;
  categoryName?: string;
  price?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface ResourceItem {
  id: number | string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

export interface CommodityItem {
  id: number | string;
  name: string;
  categoryName?: string;
  price?: string;
  [key: string]: unknown;
}

export function useServices() {
  return useQuery<{ services: ServiceItem[] }>({
    queryKey: ["directories-services"],
    queryFn: async () => {
      const { data } = await api.get("/directories/services");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useResources() {
  return useQuery<{ resources: ResourceItem[] }>({
    queryKey: ["directories-resources"],
    queryFn: async () => {
      const { data } = await api.get("/directories/resources");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCommodities() {
  return useQuery<{ commodities: CommodityItem[] }>({
    queryKey: ["directories-commodities"],
    queryFn: async () => {
      const { data } = await api.get("/directories/commodities");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
