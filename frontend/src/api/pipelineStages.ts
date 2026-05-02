import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface PipelineStage {
  id: string;
  key: string;
  label: string;
  color: string;
  position: number;
  is_system: boolean;
}

export function usePipelineStages() {
  return useQuery<PipelineStage[]>({
    queryKey: ["pipeline-stages"],
    queryFn: async () => {
      const { data } = await api.get("/pipeline-stages/");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRenameStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { data } = await api.patch(`/pipeline-stages/${id}`, { label });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-stages"] }),
  });
}

export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stageIds: string[]) => {
      const { data } = await api.put("/pipeline-stages/reorder", { stage_ids: stageIds });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-stages"] }),
  });
}
