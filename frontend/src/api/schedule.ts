import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface Appointment {
  id: string;
  external_id: string | null;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string | null;
  doctor_name: string | null;
  doctor_id: string | null;
  service: string | null;
  branch: string | null;
  scheduled_at: string | null;
  duration_min: number;
  status: string | null;
  revenue: number;
}

export interface ScheduleStats {
  total: number;
  confirmed: number;
  cancelled: number;
  completion_rate: number;
}

export interface ScheduleResponse {
  appointments: Appointment[];
  stats: ScheduleStats;
}

export function useSchedule(params: { date_from?: string; date_to?: string; doctor?: string; status?: string } = {}) {
  return useQuery<ScheduleResponse>({
    queryKey: ["schedule", params],
    queryFn: async () => {
      const { data } = await api.get("/schedule/", { params });
      return data;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export interface AppointmentDetailResponse {
  appointment: {
    id: string;
    external_id: string | null;
    doctor_name: string | null;
    doctor_id: string | null;
    service: string | null;
    branch: string | null;
    scheduled_at: string | null;
    duration_min: number;
    status: string | null;
    revenue: number;
  };
  patient: {
    id: string;
    external_id: string | null;
    name: string;
    phone: string | null;
    email: string | null;
    birth_date: string | null;
    source_channel: string | null;
    is_new_patient: boolean;
    last_visit_at: string | null;
    total_revenue: number;
    ltv_score: number | null;
    tags: string[] | null;
    raw_1denta_data: Record<string, unknown> | null;
  } | null;
}

export function useAppointmentDetail(id: string | null) {
  return useQuery<AppointmentDetailResponse>({
    queryKey: ["appointment-detail", id],
    queryFn: async () => {
      const { data } = await api.get(`/schedule/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useSyncSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/schedule/sync");
      return data;
    },
    onSuccess: () => {
      // Celery task runs in background — refetch after a short delay
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["schedule"] });
        qc.invalidateQueries({ queryKey: ["patients"] });
      }, 8000);
    },
  });
}

export interface CreateAppointmentData {
  patient_name: string;
  patient_phone: string;
  patient_email?: string;
  doctor_id: string;
  doctor_name: string;
  service: string;
  service_ids?: string[];
  scheduled_at: string;
  duration_min?: number;
  comment?: string;
  branch?: string;
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateAppointmentData) => {
      const { data: result } = await api.post("/schedule/", data);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}

export interface Doctor {
  doctor_id: string;
  doctor_name: string;
  appointments_today: number;
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ appointmentId, status }: { appointmentId: string; status: string }) => {
      const { data } = await api.patch(`/schedule/${appointmentId}/status`, { status });
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["appointment-detail", vars.appointmentId] });
    },
  });
}

export function useDoctorsList() {
  return useQuery<{ doctors: Doctor[] }>({
    queryKey: ["doctors-list"],
    queryFn: async () => {
      const { data } = await api.get("/doctors/");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appointmentId,
      ...updates
    }: {
      appointmentId: string;
      service?: string;
      doctor_name?: string;
      doctor_id?: string;
    }) => {
      const { data } = await api.patch(`/schedule/${appointmentId}`, updates);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["appointment-detail", vars.appointmentId] });
    },
  });
}
