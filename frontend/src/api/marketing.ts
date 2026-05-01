import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/* ── Types ── */

export interface DiscountResponse {
  id: string;
  name: string;
  type: "percent" | "fixed" | "bonus";
  value: number;
  code: string | null;
  applies_to: string | null;
  valid_from: string | null;
  valid_to: string | null;
  min_purchase: number | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscountCreate {
  name: string;
  type: string;
  value: number;
  code?: string;
  applies_to?: string;
  valid_from?: string;
  valid_to?: string;
  min_purchase?: number;
  max_uses?: number;
  is_active?: boolean;
  description?: string;
}

export interface CertificateResponse {
  id: string;
  code: string;
  amount: number;
  remaining_amount: number;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  purchased_by: string | null;
  valid_from: string;
  valid_to: string;
  status: "active" | "used" | "expired" | "cancelled";
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CertificateCreate {
  amount: number;
  valid_from: string;
  valid_to: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_email?: string;
  purchased_by?: string;
  note?: string;
  code?: string;
}

/* ── Discounts ── */

export function useDiscounts(isActive?: boolean) {
  return useQuery({
    queryKey: ["discounts", isActive],
    queryFn: async () => {
      const params: Record<string, unknown> = {};
      if (isActive !== undefined) params.is_active = isActive;
      const { data } = await api.get("/marketing/discounts", { params });
      return data as { items: DiscountResponse[]; total: number };
    },
    staleTime: 30_000,
  });
}

export function useCreateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DiscountCreate) => {
      const { data } = await api.post("/marketing/discounts", body);
      return data as DiscountResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts"] }),
  });
}

export function useUpdateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<DiscountCreate> & { id: string }) => {
      const { data } = await api.patch(`/marketing/discounts/${id}`, body);
      return data as DiscountResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts"] }),
  });
}

export function useDeleteDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await api.delete(`/marketing/discounts/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts"] }),
  });
}

/* ── Certificates ── */

export function useCertificates(statusFilter?: string) {
  return useQuery({
    queryKey: ["certificates", statusFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = {};
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/marketing/certificates", { params });
      return data as { items: CertificateResponse[]; total: number };
    },
    staleTime: 30_000,
  });
}

export function useCreateCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CertificateCreate) => {
      const { data } = await api.post("/marketing/certificates", body);
      return data as CertificateResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["certificates"] }),
  });
}

export function useUpdateCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<CertificateCreate & { status: string; remaining_amount: number }> & { id: string }) => {
      const { data } = await api.patch(`/marketing/certificates/${id}`, body);
      return data as CertificateResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["certificates"] }),
  });
}

export function useDeleteCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await api.delete(`/marketing/certificates/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["certificates"] }),
  });
}
