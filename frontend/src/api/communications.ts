import { useQuery } from "@tanstack/react-query";
import type {
  CommunicationFilters,
  CommunicationListResponse,
} from "../types";
import { api } from "./client";

export async function fetchCommunications(
  params?: CommunicationFilters,
): Promise<CommunicationListResponse> {
  const { data } = await api.get<CommunicationListResponse>("/communications/", {
    params: {
      status: params?.status,
      channel: params?.channel,
      priority: params?.priority,
    },
  });
  return data;
}

export function useCommunications(params?: CommunicationFilters) {
  return useQuery<CommunicationListResponse>({
    queryKey: ["communications", params],
    queryFn: () => fetchCommunications(params),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
