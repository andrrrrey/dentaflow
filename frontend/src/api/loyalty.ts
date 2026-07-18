import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/* ── Types ─────────────────────────────────────────────── */

export interface LoyaltyConfig {
  enabled: boolean;
  points_per_purchase_unit: number;
  purchase_rate_rubles: number;
  referral_points: number;
  review_points: number;
}

export interface LoyaltyTransactionEntry {
  id: string;
  patient_id: string;
  action_type: string;
  points: number;
  description: string | null;
  source_appointment_id: string | null;
  review_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LoyaltyLedgerResponse {
  balance: number;
  items: LoyaltyTransactionEntry[];
}

export interface AwardPointsInput {
  action_type: string; // referral | review | manual
  points: number;
  description?: string;
}

export interface ReferralCodeResponse {
  patient_id: string;
  referral_code: string;
}

export interface PatientBrief {
  id: string;
  name: string;
  phone: string | null;
  bonus_balance: number;
  referral_code: string | null;
}

export interface ReviewEntry {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  channel: string | null;
  image_url: string;
  status: string;
  points_awarded: number | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface RatingEntry {
  patient_id: string;
  name: string;
  value: number;
  rank: number;
}

export interface LoyaltyStats {
  total_points_awarded: number;
  points_by_action: Record<string, number>;
  pending_reviews: number;
  approved_reviews: number;
  total_referrals: number;
  active_patients: number;
  top_by_balance: RatingEntry[];
  top_by_referrals: RatingEntry[];
}

/* ── Config ────────────────────────────────────────────── */

export function useLoyaltyConfig() {
  return useQuery<LoyaltyConfig>({
    queryKey: ["loyalty", "config"],
    queryFn: async () => {
      const { data } = await api.get("/loyalty/config");
      return data;
    },
  });
}

export function useSaveLoyaltyConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: LoyaltyConfig) => {
      const { data } = await api.put("/loyalty/config", config);
      return data as LoyaltyConfig;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty", "config"] }),
  });
}

/* ── Stats ─────────────────────────────────────────────── */

export function useLoyaltyStats() {
  return useQuery<LoyaltyStats>({
    queryKey: ["loyalty", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/loyalty/stats");
      return data;
    },
  });
}

/* ── Reviews ───────────────────────────────────────────── */

export function useLoyaltyReviews(status?: string) {
  return useQuery<ReviewEntry[]>({
    queryKey: ["loyalty", "reviews", status ?? "all"],
    queryFn: async () => {
      const { data } = await api.get("/loyalty/reviews", {
        params: status ? { status } : undefined,
      });
      return data;
    },
  });
}

export function useApproveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, points }: { id: string; points: number }) => {
      const { data } = await api.post(`/loyalty/reviews/${id}/approve`, { points });
      return data as ReviewEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty"] }),
  });
}

export function useRejectReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/loyalty/reviews/${id}/reject`);
      return data as ReviewEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty"] }),
  });
}

/* ── Per-patient ───────────────────────────────────────── */

export function useLoyaltyLedger(patientId?: string) {
  return useQuery<LoyaltyLedgerResponse>({
    queryKey: ["loyalty", "ledger", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data } = await api.get(`/loyalty/patients/${patientId}/ledger`);
      return data;
    },
  });
}

export function useAwardLoyaltyPoints(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AwardPointsInput) => {
      const { data } = await api.post(`/loyalty/patients/${patientId}/award`, input);
      return data as LoyaltyTransactionEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty", "ledger", patientId] });
      qc.invalidateQueries({ queryKey: ["loyalty", "stats"] });
    },
  });
}

export function useCreateReferralCode(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/loyalty/patients/${patientId}/referral-code`);
      return data as ReferralCodeResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty", "ledger", patientId] }),
  });
}

export function useFindPatientByReferralCode() {
  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await api.get(`/loyalty/patients/by-referral-code/${encodeURIComponent(code)}`);
      return data as PatientBrief;
    },
  });
}
