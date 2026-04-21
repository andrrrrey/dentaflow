import KpiCards from "../components/dashboard/KpiCards";
import AIInsightBanner from "../components/dashboard/AIInsightBanner";
import FunnelChart from "../components/dashboard/FunnelChart";
import SourcesTable from "../components/dashboard/SourcesTable";
import DoctorsLoad from "../components/dashboard/DoctorsLoad";
import AdminsRating from "../components/dashboard/AdminsRating";
import type { DashboardOverview } from "../types";

/* ── Mock data (matches backend dev response for period=week) ── */

const mockData: DashboardOverview = {
  kpi: {
    new_leads: 46,
    appointments_created: 38,
    appointments_confirmed: 32,
    no_shows: 5,
    leads_lost: 6,
    revenue_planned: 1_190_000,
    conversion_rate: 82.4,
  },
  funnel: [
    { stage: "Новые обращения", count: 46, pct: 100 },
    { stage: "Контакт", count: 41, pct: 89.1 },
    { stage: "Записан", count: 38, pct: 82.6 },
    { stage: "Пришёл", count: 32, pct: 69.6 },
    { stage: "Лечение", count: 28, pct: 60.9 },
    { stage: "Оплата", count: 27, pct: 58.7 },
  ],
  sources: [
    { channel: "Telegram", leads: 18, conversion: 78.5, cpl: 320 },
    { channel: "Телефония", leads: 12, conversion: 85.0, cpl: 540 },
    { channel: "Сайт", leads: 8, conversion: 62.3, cpl: 480 },
    { channel: "VK / Реклама", leads: 5, conversion: 55.0, cpl: 720 },
    { channel: "Рекомендации", leads: 3, conversion: 91.0, cpl: 0 },
  ],
  doctors_load: [
    { name: "Иванова Е.А.", spec: "Терапевт", load_pct: 92 },
    { name: "Петров С.В.", spec: "Ортопед", load_pct: 78 },
    { name: "Сидорова М.К.", spec: "Хирург", load_pct: 65 },
    { name: "Козлов Д.И.", spec: "Ортодонт", load_pct: 88 },
    { name: "Новикова А.П.", spec: "Терапевт", load_pct: 54 },
  ],
  admins_rating: [
    { name: "Ольга Смирнова", conversion: 87.5, calls: 124, score: 4.8 },
    { name: "Мария Волкова", conversion: 79.2, calls: 98, score: 4.5 },
    { name: "Анна Кузнецова", conversion: 72.0, calls: 86, score: 4.2 },
    { name: "Елена Морозова", conversion: 68.3, calls: 72, score: 3.9 },
  ],
  ai_insights: {
    summary:
      "За неделю конверсия выросла на 3.2%. " +
      "Telegram стал основным каналом привлечения. " +
      "Рекомендуется увеличить слоты у доктора Ивановой — загрузка 92%.",
    chips: [
      { type: "ok", text: "Конверсия +3.2%", action: "funnel" },
      { type: "warn", text: "Загрузка 92% — Иванова", action: "doctors" },
      { type: "danger", text: "5 неявок за неделю", action: "no_shows" },
      { type: "blue", text: "Telegram — лидер", action: "sources" },
    ],
    recommendations: [
      {
        title: "Открыть доп. слоты у Ивановой Е.А.",
        body:
          "Загрузка терапевта Ивановой достигла 92%. " +
          "Рекомендуется добавить вечерние слоты или " +
          "перенаправить часть пациентов к Новиковой (54%).",
      },
      {
        title: "Усилить работу с неявками",
        body:
          "5 неявок на этой неделе — на 40% больше нормы. " +
          "Настройте автоматическое напоминание за 2 часа до приёма " +
          "через Telegram.",
      },
    ],
  },
};

export default function Dashboard() {
  const data = mockData;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* KPI Cards — 6 columns */}
      <KpiCards kpi={data.kpi} />

      {/* AI Insight Banner */}
      <AIInsightBanner insights={data.ai_insights} />

      {/* Funnel + Sources — two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <FunnelChart funnel={data.funnel} />
        <SourcesTable sources={data.sources} />
      </div>

      {/* Doctors Load + Admins Rating — two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <DoctorsLoad doctors={data.doctors_load} />
        <AdminsRating admins={data.admins_rating} />
      </div>
    </div>
  );
}
