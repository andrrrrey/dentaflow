import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/* ── Types ─────────────────────────────────────────────── */

export interface TaskResponse {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  deal_id: string | null;
  comm_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_by: string | null;
  type: string | null;
  title: string | null;
  due_at: string | null;
  done_at: string | null;
  is_done: boolean;
  created_at: string;
}

export interface TaskListResponse {
  items: TaskResponse[];
  total: number;
  overdue_count: number;
}

export interface TaskCreateInput {
  type: string;
  title: string;
  due_at: string;
  patient_id?: string | null;
  assigned_to?: string | null;
}

/* ── Hooks ─────────────────────────────────────────────── */

export function useTasks(filters?: { assigned_to?: string; is_done?: boolean }) {
  return useQuery<TaskListResponse>({
    queryKey: ["tasks", filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters?.assigned_to) params.assigned_to = filters.assigned_to;
      if (filters?.is_done !== undefined) params.is_done = String(filters.is_done);
      const { data } = await api.get("/tasks/", { params });
      return data;
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskCreateInput) => {
      const { data } = await api.post("/tasks/", input);
      return data as TaskResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["patient"] });
    },
  });
}

export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, isDone }: { taskId: string; isDone: boolean }) => {
      const { data } = await api.patch(`/tasks/${taskId}`, { is_done: isDone });
      return data as TaskResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["patient"] });
    },
  });
}
