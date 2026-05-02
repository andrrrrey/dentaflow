import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { DashboardOverview } from "../types";

export async function fetchDashboardOverview(
  period: string,
): Promise<DashboardOverview> {
  const { data } = await api.get<DashboardOverview>("/dashboard/overview", {
    params: { period },
  });
  return data;
}

export function useDashboardOverview(period: string) {
  return useQuery<DashboardOverview>({
    queryKey: ["dashboard", "overview", period],
    queryFn: () => fetchDashboardOverview(period),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}
