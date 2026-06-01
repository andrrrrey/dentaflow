import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/* ── Types ─────────────────────────────────────────────── */

export interface RewardsConfig {
  task_completed: number;
  call_made: number;
  script_compliance: number;
  appointment_confirmed: number;
  patient_reached: number;
}

export interface PointsEntry {
  id: string;
  user_id: string;
  user_name: string | null;
  action_type: string;
  points: number;
  task_id: string | null;
  description: string | null;
  created_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  avatar_url: string | null;
  total_points: number;
  tasks_completed: number;
  rank: number;
}

export interface LeaderboardResponse {
  items: LeaderboardEntry[];
}

export interface AwardPointsInput {
  user_id: string;
  action_type: string;
  points: number;
  description?: string;
}

/* ── Hooks ─────────────────────────────────────────────── */

export function useLeaderboard() {
  return useQuery<LeaderboardResponse>({
    queryKey: ["rewards", "leaderboard"],
    queryFn: async () => {
      const { data } = await api.get("/rewards/leaderboard");
      return data;
    },
  });
}

export function useRewardsHistory() {
  return useQuery<PointsEntry[]>({
    queryKey: ["rewards", "history"],
    queryFn: async () => {
      const { data } = await api.get("/rewards/history");
      return data;
    },
  });
}

export function useRewardsConfig() {
  return useQuery<RewardsConfig>({
    queryKey: ["rewards", "config"],
    queryFn: async () => {
      const { data } = await api.get("/rewards/config");
      return data;
    },
  });
}

export function useSaveRewardsConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: RewardsConfig) => {
      const { data } = await api.put("/rewards/config", config);
      return data as RewardsConfig;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rewards", "config"] });
    },
  });
}

export function useAwardPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AwardPointsInput) => {
      const { data } = await api.post("/rewards/award", input);
      return data as PointsEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rewards"] });
    },
  });
}
