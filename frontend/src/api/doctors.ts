import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface DoctorListItem {
  doctor_id: string | null;
  doctor_name: string;
  appointments_today: number;
}

export interface DoctorListResponse {
  doctors: DoctorListItem[];
}

export function useDoctorsList() {
  return useQuery<DoctorListResponse>({
    queryKey: ["doctors-list"],
    queryFn: async () => {
      const { data } = await api.get("/doctors/");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface DoctorLoad {
  doctor_id: string | null;
  doctor_name: string;
  appointments: number;
  max_slots: number;
  load_pct: number;
  revenue: number;
  status: "normal" | "busy" | "overloaded";
}

export interface DoctorsLoadResponse {
  date: string;
  doctors: DoctorLoad[];
}

export function useDoctorsLoad(targetDate?: string) {
  return useQuery<DoctorsLoadResponse>({
    queryKey: ["doctors-load", targetDate],
    queryFn: async () => {
      const { data } = await api.get("/doctors/load", targetDate ? { params: { target_date: targetDate } } : {});
      return data;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
