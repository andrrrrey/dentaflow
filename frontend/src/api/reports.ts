import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface RevenueReport {
  total_revenue: number;
  total_appointments: number;
  by_day: { date: string; revenue: number; count: number }[];
}

export interface PatientsReport {
  total_patients: number;
  new_patients: number;
  returning_patients: number;
}

export interface ServicesReport {
  services: { service: string; count: number; revenue: number }[];
}

export interface DoctorsReport {
  doctors: { doctor_name: string; count: number; revenue: number; completed: number }[];
}

interface ReportParams {
  date_from?: string;
  date_to?: string;
}

export function useRevenueReport(params: ReportParams = {}) {
  return useQuery<RevenueReport>({
    queryKey: ["report-revenue", params],
    queryFn: async () => {
      const { data } = await api.get("/reports/revenue", { params });
      return data;
    },
    staleTime: 60_000,
  });
}

export function usePatientsReport(params: ReportParams = {}) {
  return useQuery<PatientsReport>({
    queryKey: ["report-patients", params],
    queryFn: async () => {
      const { data } = await api.get("/reports/patients", { params });
      return data;
    },
    staleTime: 60_000,
  });
}

export function useServicesReport(params: ReportParams = {}) {
  return useQuery<ServicesReport>({
    queryKey: ["report-services", params],
    queryFn: async () => {
      const { data } = await api.get("/reports/services", { params });
      return data;
    },
    staleTime: 60_000,
  });
}

export function useDoctorsReport(params: ReportParams = {}) {
  return useQuery<DoctorsReport>({
    queryKey: ["report-doctors", params],
    queryFn: async () => {
      const { data } = await api.get("/reports/doctors", { params });
      return data;
    },
    staleTime: 60_000,
  });
}
