import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface CallRecord {
  call_id: string;
  caller_id: string;
  called_did: string;
  direction: string;
  duration: number;
  status: string;
  started_at: string;
  recording_url?: string;
}

export interface CallsStats {
  total: number;
  answered: number;
  missed: number;
  answer_rate: number;
}

export interface CallsResponse {
  calls: CallRecord[];
  stats: CallsStats;
}

export function useCalls(params: { days?: number; status?: string } = {}) {
  return useQuery<CallsResponse>({
    queryKey: ["calls", params],
    queryFn: async () => {
      const { data } = await api.get("/calls/", { params });
      return data;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });
}
