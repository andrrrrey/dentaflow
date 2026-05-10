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
import type { AIInsights, DoctorLoad } from "../types";

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

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function getPeriodLabel(period: "day" | "week" | "month", year?: number, month?: number): string {
  const now = new Date();
  if (period === "day") return format(now, "d MMMM yyyy", { locale: ru });
  if (period === "week") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return `${format(start, "d MMM", { locale: ru })} — ${format(end, "d MMM yyyy", { locale: ru })}`;
  }
  const targetDate = new Date(year || now.getFullYear(), (month || now.getMonth() + 1) - 1, 1);
  const start = startOfMonth(targetDate);
  const end = endOfMonth(targetDate);
  return `${format(start, "d MMM", { locale: ru })} — ${format(end, "d MMM yyyy", { locale: ru })}`;
}

type Period = "day" | "week" | "month";
const PERIOD_LABELS: Record<Period, string> = { day: "День", week: "Неделя", month: "Месяц" };

/* ── Component ───────────────────────────────────────────── */

export default function Dashboard() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>("week");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const year = period === "month" ? selectedYear : undefined;
  const month = period === "month" ? selectedMonth : undefined;

  const { data: overview, isLoading: overviewLoading } = useDashboardOverview(period, year, month);
  const { data: rawInsights } = useAiInsights();
  const { data: rawDoctors } = useDoctorsLoad();
  const refreshInsights = useRefreshDashboardInsights();

  const aiInsights = adaptAiInsights(refreshInsights.data ?? rawInsights);
  const doctorsLoad = adaptDoctorsLoad(rawDoctors);
  const funnel = overview?.funnel ?? [];

  const currentYear = now.getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Period selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
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

          {period === "month" && (
            <div className="flex items-center gap-1">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="text-[13px] font-semibold bg-white border border-[rgba(0,0,0,0.1)] rounded-lg px-3 py-1.5 text-text-main shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/30"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="text-[13px] font-semibold bg-white border border-[rgba(0,0,0,0.1)] rounded-lg px-3 py-1.5 text-text-main shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/30"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <span className="text-[12px] text-text-muted font-medium">
          {getPeriodLabel(period, selectedYear, selectedMonth)}
        </span>
      </div>

      {/* AI Insight Banner */}
      <AIInsightBanner
        insights={aiInsights}
        onRefresh={() => refreshInsights.mutate(period)}
        isRefreshing={refreshInsights.isPending}
      />

      {/* KPI Cards */}
      {overview ? (
        <KpiCards kpi={overview.kpi} />
      ) : overviewLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[88px] rounded-[16px] animate-pulse" style={{ background: "rgba(91,76,245,0.06)" }} />
          ))}
        </div>
      ) : null}

      {/* Patient Funnel + Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <FunnelChart funnel={funnel} />
        <SourcesTable sources={overview?.sources ?? []} />
      </div>

      {/* Doctors Load + Admins Rating */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <DoctorsLoad doctors={doctorsLoad.length ? doctorsLoad : (overview?.doctors_load ?? [])} />
        <AdminsRating admins={overview?.admins_rating ?? []} />
      </div>
    </div>
  );
}
