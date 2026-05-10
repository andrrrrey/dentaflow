import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { DashboardOverview } from "../types";

export async function fetchDashboardOverview(
  period: string,
  year?: number,
  month?: number,
): Promise<DashboardOverview> {
  const { data } = await api.get<DashboardOverview>("/dashboard/overview", {
    params: { period, ...(year ? { year } : {}), ...(month ? { month } : {}) },
  });
  return data;
}

export function useDashboardOverview(period: string, year?: number, month?: number) {
  return useQuery<DashboardOverview>({
    queryKey: ["dashboard", "overview", period, year ?? null, month ?? null],
    queryFn: () => fetchDashboardOverview(period, year, month),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}
