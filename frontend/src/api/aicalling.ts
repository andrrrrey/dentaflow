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
