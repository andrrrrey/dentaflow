import { useState, useMemo } from "react";
import { format, subDays, addDays, startOfMonth, endOfMonth, parseISO, eachDayOfInterval } from "date-fns";
import { ru } from "date-fns/locale";
import StatCard from "../components/ui/StatCard";
import Card from "../components/ui/Card";
import { TrendingUp, CreditCard, UserPlus, Target, ChevronLeft, ChevronRight, CalendarRange, Megaphone, Baby } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useRevenueReport, usePatientsReport, useServicesReport, useSourcesReport, usePrimaryPatientsReport } from "../api/reports";

type ViewMode = "week" | "month";

function formatRub(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".", ",") + " млн ₽";
  return (v / 1000).toFixed(0) + " тыс ₽";
}

export default function Analytics() {
  const [mode, setMode] = useState<ViewMode>("week");
  const [weekOffset, setWeekOffset] = useState(0); // 0 = last 7 days, -1 = prev 7 days, etc.

  const now = new Date();

  // Rolling 7-day window: offset 0 = yesterday–6 days ago, shifted by weekOffset*7
  const periodEnd = addDays(now, weekOffset * 7);
  const periodStart = subDays(periodEnd, 6);

  const dateFrom = mode === "week"
    ? format(periodStart, "yyyy-MM-dd")
    : format(startOfMonth(now), "yyyy-MM-dd");

  const dateTo = mode === "week"
    ? format(periodEnd, "yyyy-MM-dd")
    : format(endOfMonth(now), "yyyy-MM-dd");

  const periodLabel = mode === "week"
    ? `${format(periodStart, "d MMM", { locale: ru })} — ${format(periodEnd, "d MMM yyyy", { locale: ru })}`
    : format(now, "LLLL yyyy", { locale: ru });

  const params = { date_from: dateFrom, date_to: dateTo };
  const { data: revenue, isLoading: revLoading } = useRevenueReport(params);
  const { data: patients, isLoading: patLoading } = usePatientsReport(params);
  const { data: services } = useServicesReport(params);
  const { data: sources } = useSourcesReport(params);
  const { data: primary } = usePrimaryPatientsReport(params);

  const totalRevenue = revenue?.total_revenue ?? 0;
  const totalAppts = revenue?.total_appointments ?? 0;
  const avgCheck = totalAppts > 0 ? Math.round(totalRevenue / totalAppts) : 0;
  const newPatients = patients?.new_patients ?? 0;
  const conversionRate = revenue?.conversion_rate ?? 0;

  const sourcesData = sources?.sources ?? [];
  const sourcesTotal = sources?.total ?? 0;
  const servicesData = services?.services ?? [];
  const totalServiceCount = servicesData.reduce((sum, s) => sum + s.count, 0) || 1;

  // Build a zero-filled 7-day array for the chart (week mode)
  const revenueChartData = useMemo(() => {
    if (mode === "month") {
      return (revenue?.by_day ?? []).map((d) => ({
        date: format(parseISO(d.date), "dd.MM"),
        revenue: d.revenue,
      }));
    }
    const byDayMap = new Map<string, number>(
      (revenue?.by_day ?? []).map((d) => [d.date, d.revenue])
    );
    return eachDayOfInterval({ start: periodStart, end: periodEnd }).map((day) => {
      const key = format(day, "yyyy-MM-dd");
      return { date: format(day, "dd.MM"), revenue: byDayMap.get(key) ?? 0 };
    });
  }, [revenue, mode, periodStart, periodEnd]);

  // Primary patients chart — adults/children per day (zero-filled in week mode)
  const primaryChartData = useMemo(() => {
    const byDay = primary?.by_day ?? [];
    if (mode === "month") {
      return byDay.map((d) => ({
        date: format(parseISO(d.date), "dd.MM"),
        adults: d.adults,
        children: d.children,
      }));
    }
    const map = new Map(byDay.map((d) => [d.date, d]));
    return eachDayOfInterval({ start: periodStart, end: periodEnd }).map((day) => {
      const key = format(day, "yyyy-MM-dd");
      const d = map.get(key);
      return { date: format(day, "dd.MM"), adults: d?.adults ?? 0, children: d?.children ?? 0 };
    });
  }, [primary, mode, periodStart, periodEnd]);

  return (
    <div className="flex flex-col gap-[18px]">
      {/* ── Общий фильтр по периоду (для всех блоков ниже) ── */}
      <div
        className="rounded-glass p-[16px_20px] flex flex-wrap items-center justify-between gap-4"
        style={{
          background: "linear-gradient(135deg, rgba(91,76,245,0.10), rgba(59,127,237,0.08))",
          border: "1px solid rgba(91,76,245,0.18)",
          boxShadow: "0 4px 20px rgba(91,76,245,0.10)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
          >
            <CalendarRange size={20} className="text-white" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Период аналитики</div>
            <div className="text-[16px] font-extrabold text-text-main capitalize">{periodLabel}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex gap-[2px] p-[3px] rounded-[10px] bg-white/60">
            {(["week", "month"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setWeekOffset(0); }}
                className="px-4 py-[6px] rounded-[8px] text-[12px] font-bold border-none cursor-pointer transition-all"
                style={
                  mode === m
                    ? { background: "linear-gradient(135deg, #5B4CF5, #3B7FED)", color: "#fff", boxShadow: "0 2px 8px rgba(91,76,245,0.25)" }
                    : { background: "transparent", color: "#8a8fa5" }
                }
              >
                {m === "week" ? "Неделя" : "Месяц"}
              </button>
            ))}
          </div>

          {/* Week navigation (only in week mode) */}
          {mode === "week" && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekOffset((o) => o - 1)}
                className="w-8 h-8 rounded-[9px] flex items-center justify-center border-none cursor-pointer bg-white/70"
                style={{ color: "#5B4CF5" }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
                disabled={weekOffset === 0}
                className="w-8 h-8 rounded-[9px] flex items-center justify-center border-none cursor-pointer bg-white/70 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: "#5B4CF5" }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

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
          label="Конверсия в визит"
          value={`${conversionRate}%`}
          delta="пришли / записались"
          deltaType="up"
          icon={<Target size={18} className="text-accent3" />}
        />
      </div>

      {/* Revenue chart */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-[15px] font-bold text-text-main">Выручка по дням</h2>
        </div>

        {revenueChartData.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-text-muted text-[13px]">
            Нет данных за выбранный период
          </div>
        ) : (
          <div className="h-[220px]">
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
        )}
      </Card>

      {/* Primary patients */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[18px]">📊</span>
            <h2 className="text-[15px] font-bold text-text-main">Показатели по первичным пациентам</h2>
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <span className="px-3 py-[5px] rounded-[10px] font-bold" style={{ background: "rgba(91,76,245,0.10)", color: "#5B4CF5" }}>
              {primary?.total ?? 0} первичных
            </span>
            <span className="flex items-center gap-1.5 px-3 py-[5px] rounded-[10px] font-semibold" style={{ background: "rgba(59,127,237,0.10)", color: "#2563eb" }}>
              Взрослые — {primary?.adults ?? 0}
            </span>
            <span className="flex items-center gap-1.5 px-3 py-[5px] rounded-[10px] font-semibold" style={{ background: "rgba(245,166,35,0.12)", color: "#b45309" }}>
              <Baby size={13} /> Дети — {primary?.children ?? 0}
            </span>
          </div>
        </div>

        {(primary?.total ?? 0) === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-text-muted text-[13px]">
            Нет первичных пациентов за выбранный период
          </div>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={primaryChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,76,245,0.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#8a8fa5" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8a8fa5" }} width={30} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(255,255,255,0.95)",
                    border: "1px solid rgba(91,76,245,0.15)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="adults" name="Взрослые" stackId="p" fill="#3B7FED" radius={[0, 0, 0, 0]} />
                <Bar dataKey="children" name="Дети" stackId="p" fill="#f5a623" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        {/* Sources */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Megaphone size={16} className="text-accent2" />
            <h2 className="text-[15px] font-bold text-text-main">Источники обращений</h2>
          </div>
          {sourcesData.length === 0 ? (
            <div className="text-center text-text-muted py-6 text-[13px]">Нет данных за период</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[1fr_60px_110px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
                {["Источник", "Пациенты", "Доля"].map((h) => (
                  <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{h}</span>
                ))}
              </div>
              {sourcesData.map((s) => {
                const share = sourcesTotal > 0 ? Math.round((s.count / sourcesTotal) * 100) : 0;
                return (
                  <div key={s.source} className="grid grid-cols-[1fr_60px_110px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors">
                    <span className="text-[13px] text-text-main font-medium">{s.source}</span>
                    <span className="text-[13px] text-text-main font-bold">{s.count}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-[6px] rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: "linear-gradient(90deg,#5B4CF5,#3B7FED)" }} />
                      </div>
                      <span className="text-[11px] text-text-muted w-[28px] text-right">{share}%</span>
                    </div>
                  </div>
                );
              })}
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
                {["Услуга", "Кол-во", "Выручка", "Доля"].map((h) => (
                  <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{h}</span>
                ))}
              </div>
              {servicesData.map((s) => {
                const share = Math.round((s.count / totalServiceCount) * 100);
                return (
                  <div key={s.service} className="grid grid-cols-[1fr_60px_90px_100px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors">
                    <span className="text-[13px] text-text-main font-medium">{s.service}</span>
                    <span className="text-[13px] text-text-main font-bold">{s.count}</span>
                    <span className="text-[13px] text-text-main font-bold">{(s.revenue / 1000).toFixed(0)} тыс</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-[6px] rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: "linear-gradient(90deg,#5B4CF5,#3B7FED)" }} />
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
