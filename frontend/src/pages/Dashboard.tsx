import KpiCards from "../components/dashboard/KpiCards";
import AIInsightBanner from "../components/dashboard/AIInsightBanner";
import FunnelChart from "../components/dashboard/FunnelChart";
import SourcesTable from "../components/dashboard/SourcesTable";
import DoctorsLoad from "../components/dashboard/DoctorsLoad";
import AdminsRating from "../components/dashboard/AdminsRating";
import { useDashboardOverview } from "../api/dashboard";
import { useAiInsights } from "../api/ai";
import { useDoctorsLoad } from "../api/doctors";
import type { AIInsights, DoctorLoad } from "../types";

/* ── Adapters ────────────────────────────────────────────── */

function adaptAiInsights(raw: ReturnType<typeof useAiInsights>["data"]): AIInsights {
  if (!raw || raw.error) {
    return {
      summary: "Загрузка ИИ-аналитики...",
      chips: [],
      recommendations: [],
    };
  }

  const highlights: string[] = raw.highlights ?? [];
  const summaryParts = [raw.summary ?? raw.text ?? "Анализ данных завершён.", ...highlights].filter(Boolean);
  const fullSummary = summaryParts.join(" ");

  const recommendations = (raw.recommendations ?? []).map((r) => ({
    title: r.slice(0, 60),
    body: r,
  }));

  return {
    summary: fullSummary,
    chips: [],
    recommendations,
  };
}

function adaptDoctorsLoad(doctors: ReturnType<typeof useDoctorsLoad>["data"]): DoctorLoad[] {
  return (doctors?.doctors ?? []).map((d) => ({
    name: d.doctor_name,
    spec: `${d.appointments} приёмов`,
    load_pct: d.load_pct,
  }));
}

/* ── Component ───────────────────────────────────────────── */

interface DashboardProps {
  period?: "day" | "week" | "month";
}

export default function Dashboard({ period = "week" }: DashboardProps) {
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview(period);
  const { data: rawInsights } = useAiInsights();
  const { data: rawDoctors } = useDoctorsLoad();

  if (overviewLoading || !overview) {
    return (
      <div className="flex flex-col gap-[18px]">
        <div className="text-center text-text-muted py-16 text-[13px]">
          Загрузка данных...
        </div>
      </div>
    );
  }

  const aiInsights = adaptAiInsights(rawInsights);
  const doctorsLoad = adaptDoctorsLoad(rawDoctors) || overview.doctors_load;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* AI Insight Banner */}
      <AIInsightBanner insights={aiInsights} />

      {/* KPI Cards */}
      <KpiCards kpi={overview.kpi} />

      {/* Funnel + Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <FunnelChart funnel={overview.funnel} />
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
