import StatCard from "../components/ui/StatCard";
import Pill from "../components/ui/Pill";
import Card from "../components/ui/Card";
import { Megaphone, DollarSign, Users, TrendingUp } from "lucide-react";

/* ---------- types ---------- */

interface Campaign {
  id: number;
  name: string;
  channel: string;
  budget: number;
  leads: number;
  cpl: number;
  roi: number;
  status: "active" | "paused" | "completed";
}

/* ---------- mock data ---------- */

const campaigns: Campaign[] = [
  { id: 1, name: "Имплантация весна 2026", channel: "Яндекс.Директ", budget: 120000, leads: 34, cpl: 3529, roi: 285, status: "active" },
  { id: 2, name: "Брекеты для подростков", channel: "VK Таргет", budget: 85000, leads: 28, cpl: 3036, roi: 210, status: "active" },
  { id: 3, name: "Отбеливание -30%", channel: "Telegram Ads", budget: 45000, leads: 52, cpl: 865, roi: 340, status: "active" },
  { id: 4, name: "Профгигиена семейная", channel: "Google Ads", budget: 65000, leads: 18, cpl: 3611, roi: 155, status: "paused" },
  { id: 5, name: "Программа лояльности", channel: "Рекомендации", budget: 30000, leads: 41, cpl: 732, roi: 520, status: "active" },
  { id: 6, name: "Блог и SEO", channel: "Сайт SEO", budget: 50000, leads: 22, cpl: 2273, roi: 180, status: "active" },
  { id: 7, name: "Протезирование акция", channel: "Яндекс.Директ", budget: 95000, leads: 15, cpl: 6333, roi: 120, status: "completed" },
  { id: 8, name: "Детская стоматология", channel: "VK Таргет", budget: 40000, leads: 19, cpl: 2105, roi: 245, status: "paused" },
];

/* ---------- helpers ---------- */

function formatRub(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".", ",") + " млн ₽";
  return v.toLocaleString("ru-RU") + " ₽";
}

const statusCfg: Record<Campaign["status"], { label: string; variant: "green" | "yellow" | "purple" }> = {
  active: { label: "Активна", variant: "green" },
  paused: { label: "Пауза", variant: "yellow" },
  completed: { label: "Завершена", variant: "purple" },
};

/* ---------- component ---------- */

export default function Marketing() {
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const totalLeads = campaigns.reduce((s, c) => s + c.leads, 0);
  const avgCPL = Math.round(totalBudget / totalLeads);
  const avgROI = Math.round(campaigns.reduce((s, c) => s + c.roi, 0) / campaigns.length);

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px]">
        <StatCard
          label="Общий бюджет"
          value={formatRub(totalBudget)}
          icon={<DollarSign size={18} className="text-accent2" />}
        />
        <StatCard
          label="Всего лидов"
          value={String(totalLeads)}
          icon={<Users size={18} className="text-accent3" />}
          delta="+18% к прошлому"
          deltaType="up"
        />
        <StatCard
          label="Средний CPL"
          value={formatRub(avgCPL)}
          icon={<Megaphone size={18} className="text-accent2" />}
          delta="-12% к прошлому"
          deltaType="up"
        />
        <StatCard
          label="Средний ROI"
          value={`${avgROI}%`}
          icon={<TrendingUp size={18} className="text-accent3" />}
          delta="+15%"
          deltaType="up"
        />
      </div>

      {/* Campaign table */}
      <Card>
        <h2 className="text-[15px] font-bold text-text-main mb-4">Рекламные кампании</h2>

        <div className="overflow-x-auto">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1.5fr_1fr_90px_60px_80px_70px_90px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
            {(["Кампания", "Канал", "Бюджет", "Лиды", "CPL", "ROI", "Статус"] as const).map((h) => (
              <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {campaigns.map((c) => {
            const cfg = statusCfg[c.status];
            return (
              <div
                key={c.id}
                className="md:grid md:grid-cols-[1.5fr_1fr_90px_60px_80px_70px_90px] gap-3 px-[14px] py-[11px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors flex flex-col"
              >
                <span className="text-[13px] text-text-main font-bold">{c.name}</span>
                <span className="text-[12.5px] text-text-muted">{c.channel}</span>
                <span className="text-[13px] text-text-main font-medium">{formatRub(c.budget)}</span>
                <span className="text-[13px] text-text-main font-bold">{c.leads}</span>
                <span className="text-[12.5px] text-text-main">{formatRub(c.cpl)}</span>
                <span
                  className="text-[13px] font-bold"
                  style={{ color: c.roi >= 250 ? "#00c9a7" : c.roi >= 150 ? "#f5a623" : "#f44b6e" }}
                >
                  {c.roi}%
                </span>
                <span>
                  <Pill variant={cfg.variant}>{cfg.label}</Pill>
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
