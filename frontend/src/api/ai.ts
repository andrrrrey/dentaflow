import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface AiInsights {
  summary?: string;
  highlights?: string[];
  recommendations?: string[];
  text?: string;
  error?: string;
}

export interface AiSuggestionRequest {
  channel: string;
  patient_name?: string;
  patient_phone?: string;
  history?: { role: string; content: string }[];
  last_message?: string;
  context?: string;
}

export function useAiInsights() {
  return useQuery<AiInsights>({
    queryKey: ["ai-insights"],
    queryFn: async () => {
      const { data } = await api.get("/ai/insights");
      return data;
    },
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
}

export async function getAiSuggestion(body: AiSuggestionRequest): Promise<string[]> {
  const { data } = await api.post("/ai/suggestion", body);
  return data.suggestions ?? [];
}
