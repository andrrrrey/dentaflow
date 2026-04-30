import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface StaffCreate {
  name: string;
  email: string;
  role: string;
  password: string;
}

export interface StaffUpdate {
  name?: string;
  email?: string;
  role?: string;
  is_active?: boolean;
}

export function useStaff() {
  return useQuery<{ staff: StaffMember[]; total: number }>({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data } = await api.get("/staff/");
      return data;
    },
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StaffCreate) => api.post("/staff/", body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: StaffUpdate & { id: string }) =>
      api.put(`/staff/${id}`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });
}

export function useDeleteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/staff/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });
}
