import { useState } from "react";
import { format, subDays } from "date-fns";
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
} from "recharts";
import { useRevenueReport, usePatientsReport, useServicesReport } from "../api/reports";
import { useDashboardOverview } from "../api/dashboard";

function formatRub(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".", ",") + " млн ₽";
  return (v / 1000).toFixed(0) + " тыс ₽";
}

export default function Analytics() {
  const [dateFrom] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const params = { date_from: dateFrom, date_to: dateTo };
  const { data: revenue, isLoading: revLoading } = useRevenueReport(params);
  const { data: patients, isLoading: patLoading } = usePatientsReport(params);
  const { data: services } = useServicesReport(params);
  const { data: dashboard } = useDashboardOverview("month");

  const totalRevenue = revenue?.total_revenue ?? 0;
  const totalAppts = revenue?.total_appointments ?? 0;
  const avgCheck = totalAppts > 0 ? Math.round(totalRevenue / totalAppts) : 0;
  const newPatients = patients?.new_patients ?? 0;
  const conversionRate = dashboard?.kpi?.conversion_rate ?? 0;

  const sourcesData = dashboard?.sources ?? [];

  const servicesData = services?.services ?? [];
  const totalServiceCount = servicesData.reduce((sum, s) => sum + s.count, 0) || 1;

  const revenueChartData = (revenue?.by_day ?? []).map((d) => ({
    date: d.date.slice(5),
    revenue: d.revenue,
  }));

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px]">
        <StatCard
          label="Выручка за период"
          value={revLoading ? "..." : formatRub(totalRevenue)}
          icon={<TrendingUp size={18} className="text-accent3" />}
        />
        <StatCard
          label="Средний чек"
          value={revLoading ? "..." : `${avgCheck.toLocaleString("ru-RU")} ₽`}
          icon={<CreditCard size={18} className="text-accent2" />}
        />
        <StatCard
          label="Новых пациентов"
          value={patLoading ? "..." : String(newPatients)}
          icon={<UserPlus size={18} className="text-accent2" />}
        />
        <StatCard
          label="Конверсия"
          value={`${conversionRate}%`}
          icon={<Target size={18} className="text-accent3" />}
        />
      </div>

      {/* Revenue chart */}
      {revenueChartData.length > 0 && (
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">Выручка по дням</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,76,245,0.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#8a8fa5" }} />
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
      )}

      {/* Tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        {/* Sources */}
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">Источники обращений</h2>
          {sourcesData.length === 0 ? (
            <div className="text-center text-text-muted py-6 text-[13px]">Нет данных</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[1fr_60px_70px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
                {(["Канал", "Лиды", "Конв. %"] as const).map((h) => (
                  <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                    {h}
                  </span>
                ))}
              </div>
              {sourcesData.map((s) => (
                <div key={s.channel} className="grid grid-cols-[1fr_60px_70px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors">
                  <span className="text-[13px] text-text-main font-medium">{s.channel}</span>
                  <span className="text-[13px] text-text-main font-bold">{s.leads}</span>
                  <span className="text-[12.5px]" style={{ color: s.conversion >= 75 ? "#00c9a7" : s.conversion >= 60 ? "#f5a623" : "#f44b6e" }}>
                    {s.conversion}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Service popularity */}
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">Популярность услуг</h2>
          {servicesData.length === 0 ? (
            <div className="text-center text-text-muted py-6 text-[13px]">Нет данных</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[1fr_60px_90px_100px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
                {(["Услуга", "Кол-во", "Выручка", "Доля"] as const).map((h) => (
                  <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                    {h}
                  </span>
                ))}
              </div>
              {servicesData.map((s) => {
                const share = Math.round((s.count / totalServiceCount) * 100);
                return (
                  <div key={s.service} className="grid grid-cols-[1fr_60px_90px_100px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors">
                    <span className="text-[13px] text-text-main font-medium">{s.service}</span>
                    <span className="text-[13px] text-text-main font-bold">{s.count}</span>
                    <span className="text-[13px] text-text-main font-bold">
                      {(s.revenue / 1000).toFixed(0)} тыс
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-[6px] rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${share}%`,
                            background: "linear-gradient(90deg, #5B4CF5, #3B7FED)",
                          }}
                        />
                      </div>
                      <span className="text-[11px] text-text-muted w-[28px] text-right">{share}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
