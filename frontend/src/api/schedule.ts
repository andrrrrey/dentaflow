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
