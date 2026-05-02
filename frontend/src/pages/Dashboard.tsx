import { useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import KpiCards from "../components/dashboard/KpiCards";
import AIInsightBanner from "../components/dashboard/AIInsightBanner";
import FunnelChart from "../components/dashboard/FunnelChart";
import SourcesTable from "../components/dashboard/SourcesTable";
import DoctorsLoad from "../components/dashboard/DoctorsLoad";
import AdminsRating from "../components/dashboard/AdminsRating";
import { useDashboardOverview } from "../api/dashboard";
import { useAiInsights, useRefreshDashboardInsights } from "../api/ai";
import { useDoctorsLoad } from "../api/doctors";
import { useFunnel } from "../api/pipeline_ext";
import type { AIInsights, DoctorLoad, FunnelItem } from "../types";

/* ── Adapters ────────────────────────────────────────────── */

function adaptAiInsights(raw: ReturnType<typeof useAiInsights>["data"]): AIInsights {
  if (!raw || raw.error) {
    return {
      summary: "Нажмите «Обновить» для получения AI-совета на основе данных клиники.",
      chips: [],
      recommendations: [],
    };
  }

  const highlights: string[] = raw.highlights ?? [];
  const summaryParts = [raw.summary ?? raw.text ?? "Анализ данных завершён.", ...highlights].filter(Boolean);

  return {
    summary: summaryParts.join(" "),
    chips: [],
    recommendations: (raw.recommendations ?? []).map((r) => ({ title: r.slice(0, 60), body: r })),
  };
}

function adaptDoctorsLoad(doctors: ReturnType<typeof useDoctorsLoad>["data"]): DoctorLoad[] {
  return (doctors?.doctors ?? []).map((d) => ({
    name: d.doctor_name,
    spec: `${d.appointments} приёмов`,
    load_pct: d.load_pct,
  }));
}

function adaptPatientFunnel(raw: ReturnType<typeof useFunnel>["data"]): FunnelItem[] {
  return (raw?.stages ?? []).map((s) => ({
    stage: s.label,
    count: s.count,
    pct: s.pct,
  }));
}

function getPeriodLabel(period: "day" | "week" | "month"): string {
  const now = new Date();
  if (period === "day") return format(now, "d MMMM yyyy", { locale: ru });
  if (period === "week") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return `${format(start, "d MMM", { locale: ru })} — ${format(end, "d MMM yyyy", { locale: ru })}`;
  }
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  return `${format(start, "d MMM", { locale: ru })} — ${format(end, "d MMM yyyy", { locale: ru })}`;
}

type Period = "day" | "week" | "month";
const PERIOD_LABELS: Record<Period, string> = { day: "День", week: "Неделя", month: "Месяц" };

/* ── Component ───────────────────────────────────────────── */

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("week");
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview(period);
  const { data: rawInsights } = useAiInsights();
  const { data: rawDoctors } = useDoctorsLoad();
  const { data: patientFunnel } = useFunnel();
  const refreshInsights = useRefreshDashboardInsights();

  if (overviewLoading || !overview) {
    return (
      <div className="flex flex-col gap-[18px]">
        <div className="text-center text-text-muted py-16 text-[13px]">Загрузка данных...</div>
      </div>
    );
  }

  const aiInsights = adaptAiInsights(refreshInsights.data ?? rawInsights);
  const doctorsLoad = adaptDoctorsLoad(rawDoctors);
  const funnel = adaptPatientFunnel(patientFunnel);

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-[rgba(0,0,0,0.04)] rounded-lg p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all ${
                period === p
                  ? "bg-white shadow-sm text-text-main"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-text-muted font-medium">{getPeriodLabel(period)}</span>
      </div>

      {/* AI Insight Banner */}
      <AIInsightBanner
        insights={aiInsights}
        onRefresh={() => refreshInsights.mutate(period)}
        isRefreshing={refreshInsights.isPending}
      />

      {/* KPI Cards */}
      <KpiCards kpi={overview.kpi} />

      {/* Patient Funnel + Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <FunnelChart funnel={funnel.length ? funnel : overview.funnel} />
        <SourcesTable sources={overview.sources} />
      </div>

      {/* Doctors Load + Admins Rating */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <DoctorsLoad doctors={doctorsLoad.length ? doctorsLoad : overview.doctors_load} />
        <AdminsRating admins={overview.admins_rating} />
      </div>
    </div>
  );
}
