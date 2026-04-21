import StatCard from "../components/ui/StatCard";
import Card from "../components/ui/Card";
import { TrendingUp, CreditCard, UserPlus, Target } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

/* ---------- mock data ---------- */

const monthlyRevenue = [
  { month: "Окт", revenue: 980000 },
  { month: "Ноя", revenue: 1120000 },
  { month: "Дек", revenue: 1350000 },
  { month: "Янв", revenue: 890000 },
  { month: "Фев", revenue: 1050000 },
  { month: "Мар", revenue: 1190000 },
  { month: "Апр", revenue: 1280000 },
];

const conversionData = [
  { month: "Окт", conversion: 72 },
  { month: "Ноя", conversion: 75 },
  { month: "Дек", conversion: 78 },
  { month: "Янв", conversion: 70 },
  { month: "Фев", conversion: 76 },
  { month: "Мар", conversion: 80 },
  { month: "Апр", conversion: 82 },
];

const sources = [
  { channel: "Яндекс.Директ", leads: 45, conversion: 68, revenue: 420000 },
  { channel: "Telegram", leads: 38, conversion: 78, revenue: 380000 },
  { channel: "Рекомендации", leads: 22, conversion: 91, revenue: 290000 },
  { channel: "Сайт (SEO)", leads: 18, conversion: 62, revenue: 150000 },
  { channel: "VK Таргет", leads: 12, conversion: 55, revenue: 95000 },
  { channel: "Google Ads", leads: 8, conversion: 60, revenue: 65000 },
];

const services = [
  { service: "Терапия", count: 124, revenue: 620000, share: 32 },
  { service: "Ортодонтия", count: 38, revenue: 380000, share: 20 },
  { service: "Протезирование", count: 28, revenue: 350000, share: 18 },
  { service: "Хирургия", count: 22, revenue: 220000, share: 11 },
  { service: "Профгигиена", count: 86, revenue: 172000, share: 9 },
  { service: "Имплантация", count: 12, revenue: 190000, share: 10 },
];

/* ---------- helpers ---------- */

function formatRub(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".", ",") + " млн ₽";
  return (v / 1000).toFixed(0) + " тыс ₽";
}

/* ---------- component ---------- */

export default function Analytics() {
  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px]">
        <StatCard
          label="Выручка за месяц"
          value="1,28 млн ₽"
          icon={<TrendingUp size={18} className="text-accent3" />}
          delta="+7.6% к прошлому"
          deltaType="up"
        />
        <StatCard
          label="Средний чек"
          value="8 450 ₽"
          icon={<CreditCard size={18} className="text-accent2" />}
          delta="+320 ₽"
          deltaType="up"
        />
        <StatCard
          label="Новых пациентов"
          value="46"
          icon={<UserPlus size={18} className="text-accent2" />}
          delta="+12% к прошлому"
          deltaType="up"
        />
        <StatCard
          label="Конверсия"
          value="82,4%"
          icon={<Target size={18} className="text-accent3" />}
          delta="+3.2%"
          deltaType="up"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        {/* Revenue chart */}
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">Выручка по месяцам</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,76,245,0.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8a8fa5" }} />
                <YAxis
                  tickFormatter={(v: number) => formatRub(v)}
                  tick={{ fontSize: 11, fill: "#8a8fa5" }}
                  width={70}
                />
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString("ru-RU") + " ₽", "Выручка"]}
                  contentStyle={{
                    background: "rgba(255,255,255,0.95)",
                    border: "1px solid rgba(91,76,245,0.15)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="revenue" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B4CF5" />
                    <stop offset="100%" stopColor="#3B7FED" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Conversion chart */}
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">Конверсия по месяцам</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={conversionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,76,245,0.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8a8fa5" }} />
                <YAxis
                  domain={[60, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 11, fill: "#8a8fa5" }}
                  width={45}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, "Конверсия"]}
                  contentStyle={{
                    background: "rgba(255,255,255,0.95)",
                    border: "1px solid rgba(91,76,245,0.15)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="conversion"
                  stroke="#00c9a7"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#00c9a7" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        {/* Sources */}
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">Источники обращений</h2>
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[1fr_60px_70px_90px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
              {(["Канал", "Лиды", "Конв. %", "Выручка"] as const).map((h) => (
                <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  {h}
                </span>
              ))}
            </div>
            {sources.map((s) => (
              <div key={s.channel} className="grid grid-cols-[1fr_60px_70px_90px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors">
                <span className="text-[13px] text-text-main font-medium">{s.channel}</span>
                <span className="text-[13px] text-text-main font-bold">{s.leads}</span>
                <span className="text-[12.5px]" style={{ color: s.conversion >= 75 ? "#00c9a7" : s.conversion >= 60 ? "#f5a623" : "#f44b6e" }}>
                  {s.conversion}%
                </span>
                <span className="text-[13px] text-text-main font-bold text-right">
                  {(s.revenue / 1000).toFixed(0)} тыс
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Service popularity */}
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">Популярность услуг</h2>
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[1fr_60px_90px_100px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
              {(["Услуга", "Кол-во", "Выручка", "Доля"] as const).map((h) => (
                <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  {h}
                </span>
              ))}
            </div>
            {services.map((s) => (
              <div key={s.service} className="grid grid-cols-[1fr_60px_90px_100px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors">
                <span className="text-[13px] text-text-main font-medium">{s.service}</span>
                <span className="text-[13px] text-text-main font-bold">{s.count}</span>
                <span className="text-[13px] text-text-main font-bold">
                  {(s.revenue / 1000).toFixed(0)} тыс
                </span>
                {/* Share bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-[6px] rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.share}%`,
                        background: "linear-gradient(90deg, #5B4CF5, #3B7FED)",
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-text-muted w-[28px] text-right">{s.share}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
