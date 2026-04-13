import {
  Users,
  CalendarCheck,
  CheckCircle,
  XCircle,
  TrendingDown,
  Banknote,
} from "lucide-react";
import StatCard from "../ui/StatCard";
import type { KpiData } from "../../types";

interface KpiCardsProps {
  kpi: KpiData;
}

function formatRevenue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ₽`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K ₽`;
  return `${value} ₽`;
}

export default function KpiCards({ kpi }: KpiCardsProps) {
  const cards = [
    {
      label: "Новые лиды",
      value: String(kpi.new_leads),
      delta: "+12%",
      deltaType: "up" as const,
      icon: <Users size={18} className="text-accent2" />,
    },
    {
      label: "Записи",
      value: String(kpi.appointments_created),
      delta: "+8%",
      deltaType: "up" as const,
      icon: <CalendarCheck size={18} className="text-accent" />,
    },
    {
      label: "Подтверждено",
      value: String(kpi.appointments_confirmed),
      delta: `${kpi.conversion_rate}%`,
      deltaType: "up" as const,
      icon: <CheckCircle size={18} className="text-accent3" />,
    },
    {
      label: "Неявки",
      value: String(kpi.no_shows),
      delta: "-2",
      deltaType: "down" as const,
      icon: <XCircle size={18} className="text-danger" />,
    },
    {
      label: "Потеряно",
      value: String(kpi.leads_lost),
      delta: "-3",
      deltaType: "down" as const,
      icon: <TrendingDown size={18} className="text-[#f5a623]" />,
    },
    {
      label: "Выручка",
      value: formatRevenue(kpi.revenue_planned),
      delta: "+15%",
      deltaType: "up" as const,
      icon: <Banknote size={18} className="text-accent3" />,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-[14px]">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}
