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
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
