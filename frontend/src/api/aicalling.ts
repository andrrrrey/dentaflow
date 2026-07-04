import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/* ---------- Тест TTS ---------- */

export interface TTSRole {
  id: string;
  label: string;
}
export interface TTSVoice {
  id: string;
  roles: TTSRole[];
}

export function useTtsVoices() {
  return useQuery<TTSVoice[]>({
    queryKey: ["ai-calling", "voices"],
    queryFn: async () => {
      const { data } = await api.get("/ai-calling/voices");
      return data.voices ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface TtsTestRequest {
  text: string;
  voice?: string;
  speed?: number;
  role?: string;
}
export interface TtsTestResponse {
  audio_base64: string;
  format: string;
  sample_rate: number;
  size_bytes: number;
}

export function useTtsTest() {
  return useMutation<TtsTestResponse, Error, TtsTestRequest>({
    mutationFn: async (body) => {
      const { data } = await api.post("/ai-calling/tts-test", body);
      return data;
    },
  });
}

/* ---------- Тест диалога (v2.0) ---------- */

export interface DialogTurnResponse {
  robot_text: string;
  phase: string;
  phase_label: string;
  node: string;
  qual_step: number;
}

export function useDialogStart() {
  return useMutation<DialogTurnResponse, Error, { session_id: string }>({
    mutationFn: async (body) => {
      const { data } = await api.post("/ai-calling/dialog/start", body);
      return data;
    },
  });
}

export function useDialogTurn() {
  return useMutation<DialogTurnResponse, Error, { session_id: string; user_text: string }>({
    mutationFn: async (body) => {
      const { data } = await api.post("/ai-calling/dialog/turn", body);
      return data;
    },
  });
}

export function useDialogDeleteSession() {
  return useMutation<unknown, Error, string>({
    mutationFn: async (sessionId) => {
      const { data } = await api.delete(`/ai-calling/dialog/session/${sessionId}`);
      return data;
    },
  });
}

/* ---------- Скрипты диалога ---------- */

export interface Scenario {
  id: string;
  name: string;
  description?: string;
}

export function useScenarios() {
  return useQuery<Scenario[]>({
    queryKey: ["ai-calling", "scenarios"],
    queryFn: async () => {
      const { data } = await api.get("/ai-calling/scenarios");
      return data.scenarios ?? [];
    },
    staleTime: 60 * 1000,
  });
}

export interface ScriptCorrection {
  id: string;
  trigger: string;
  current_answer?: string;
  correct_answer: string;
  phase: string;
  enabled: boolean;
}

export function useScriptCorrections() {
  return useQuery<ScriptCorrection[]>({
    queryKey: ["ai-calling", "script-corrections"],
    queryFn: async () => {
      const { data } = await api.get("/ai-calling/script-corrections");
      return data.corrections ?? [];
    },
    staleTime: 30 * 1000,
  });
}

export function useAddScriptCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Omit<ScriptCorrection, "id">) => {
      const { data } = await api.post("/ai-calling/script-corrections", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-calling", "script-corrections"] }),
  });
}

export function useDeleteScriptCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/ai-calling/script-corrections/${id}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-calling", "script-corrections"] }),
  });
}

/* ---------- Кампании обзвона ---------- */

export interface Campaign {
  id: string;
  name: string;
  segment_key: string;
  scenario_id: string;
  status:
    | "scheduled"
    | "running"
    | "waiting_window"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed";
  max_concurrent: number;
  scheduled_at: string | null;
  window_start: string | null;
  window_end: string | null;
  timezone: string;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  progress: number;
  started_at: string | null;
  ended_at: string | null;
  error: string | null;
  created_at: string | null;
}

export interface CampaignItem {
  id: string;
  patient_id: string | null;
  phone: string;
  status: "pending" | "calling" | "done" | "no_answer" | "failed" | "cancelled";
  outcome: string | null;
  summary: string | null;
  duration_sec: number | null;
  attempts: number;
  updated_at: string | null;
}

export interface CampaignCreateRequest {
  name: string;
  segment_key: string;
  scenario_id?: string;
  max_concurrent?: number;
  scheduled_at?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  timezone?: string;
}

function campaignsActive(items: Campaign[]): boolean {
  return items.some((c) =>
    ["scheduled", "running", "waiting_window"].includes(c.status),
  );
}

export function useCampaigns() {
  return useQuery<{ items: Campaign[] }>({
    queryKey: ["ai-calling", "campaigns"],
    queryFn: async () => {
      const { data } = await api.get("/ai-calling/campaigns");
      return data;
    },
    // Адаптивный polling: чаще, пока есть активные кампании.
    refetchInterval: (query) =>
      campaignsActive(query.state.data?.items ?? []) ? 3000 : false,
  });
}

export function useCampaignItems(campaignId: string | null) {
  return useQuery<{ items: CampaignItem[] }>({
    queryKey: ["ai-calling", "campaign-items", campaignId],
    queryFn: async () => {
      const { data } = await api.get(`/ai-calling/campaigns/${campaignId}/items`);
      return data;
    },
    enabled: !!campaignId,
    refetchInterval: 4000,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation<Campaign, Error, CampaignCreateRequest>({
    mutationFn: async (body) => {
      const { data } = await api.post("/ai-calling/campaigns", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-calling", "campaigns"] }),
  });
}

export function useCampaignControl() {
  const qc = useQueryClient();
  return useMutation<Campaign, Error, { id: string; action: "start" | "pause" | "resume" | "cancel" }>({
    mutationFn: async ({ id, action }) => {
      const { data } = await api.post(`/ai-calling/campaigns/${id}/control`, { action });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-calling", "campaigns"] }),
  });
}

/* ---------- Тестовый звонок на телефон ---------- */

export interface TestCallResponse {
  call_id: string;
  status: string;
  greeting?: string;
}

export function useTestCall() {
  return useMutation<TestCallResponse, Error, { phone: string; scenario_id?: string }>({
    mutationFn: async (body) => {
      const { data } = await api.post("/ai-calling/test-call", body);
      return data;
    },
  });
}

export interface CallTranscriptLine {
  role: string; // robot | client | system
  text: string;
  timestamp?: number;
}
export interface CallStatus {
  call_id: string;
  status: string; // active | ringing | completed | failed ...
  transcript: CallTranscriptLine[];
  client_status?: string;
  summary?: string;
  duration?: number | null;
}

export function useCallStatus(callId: string | null) {
  return useQuery<CallStatus>({
    queryKey: ["ai-calling", "call-status", callId],
    queryFn: async () => {
      const { data } = await api.get(`/ai-calling/calls/${callId}`);
      return data;
    },
    enabled: !!callId,
    // Поллим, пока звонок не завершится.
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      return st && ["completed", "failed"].includes(st) ? false : 1500;
    },
  });
}
