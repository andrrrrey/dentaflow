import { useQuery } from "@tanstack/react-query";
import type {
  BotMessage,
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
    refetchIntervalInBackground: false,
  });
}

export async function fetchCommunicationMessages(id: string): Promise<BotMessage[]> {
  const { data } = await api.get<BotMessage[]>(`/communications/${id}/messages`);
  return data;
}

export function useCommunicationMessages(id: string | null) {
  return useQuery<BotMessage[]>({
    queryKey: ["comm_messages", id],
    queryFn: () => fetchCommunicationMessages(id!),
    enabled: !!id,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export async function sendCommunicationReply(id: string, text: string): Promise<BotMessage> {
  const { data } = await api.post<BotMessage>(`/communications/${id}/reply`, { text });
  return data;
}
