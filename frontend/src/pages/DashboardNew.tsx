import { useState } from "react";
import { Link } from "react-router-dom";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Sparkles,
  Bell,
  Search,
  Home,
  Users,
  CalendarCheck,
  CheckCircle,
  XCircle,
  TrendingDown,
  Banknote,
  RefreshCw,
  Stethoscope,
  Trophy,
  Star,
  ArrowRight,
  Lock,
  Activity,
  MessageCircle,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import { useDashboardOverview } from "../api/dashboard";
import { useAiInsights, useRefreshDashboardInsights } from "../api/ai";
import { useDoctorsLoad } from "../api/doctors";
import { useLeaderboard } from "../api/rewards";
import { useAuthStore } from "../store/authStore";

/* ── Helpers ─────────────────────────────────────────────── */

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

type Period = "day" | "week" | "month";
const PERIOD_LABELS: Record<Period, string> = { day: "День", week: "Неделя", month: "Месяц" };

function getPeriodLabel(period: Period, year?: number, month?: number): string {
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

function formatRevenue(value: number): string {
  return value.toLocaleString("ru-RU") + " ₽";
}

function summarizeInsights(raw: ReturnType<typeof useAiInsights>["data"]): string {
  if (!raw || raw.error) {
    return "Нажмите «Обновить», чтобы получить AI-совет на основе данных клиники.";
  }
  const highlights: string[] = raw.highlights ?? [];
  return [raw.summary ?? raw.text ?? "Анализ данных завершён.", ...highlights]
    .filter(Boolean)
    .join(" ");
}

function loadColor(pct: number): string {
  if (pct > 85) return "#f44b6e";
  if (pct > 70) return "#f5a623";
  return "#00c9a7";
}

/* ── Scoped styles (Apple-glass, dark) ───────────────────── */

const GLASS_STYLES = `
.dnx { font-family: 'Inter', sans-serif; }
.dnx ::-webkit-scrollbar { width: 6px; height: 6px; }
.dnx ::-webkit-scrollbar-track { background: transparent; }
.dnx ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
.dnx ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
.dnx-glass-container {
  background: linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 100%);
  backdrop-filter: blur(80px) saturate(180%) brightness(110%);
  -webkit-backdrop-filter: blur(80px) saturate(180%) brightness(110%);
  border: 0.5px solid rgba(255,255,255,0.2);
  box-shadow: 0 0 0 0.5px rgba(255,255,255,0.05) inset, 0 40px 80px -20px rgba(0,0,0,0.8), 0 0 120px rgba(99,102,241,0.1);
}
.dnx-glass-sidebar {
  background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
  backdrop-filter: blur(60px) saturate(160%);
  -webkit-backdrop-filter: blur(60px) saturate(160%);
  border-right: 0.5px solid rgba(255,255,255,0.1);
}
.dnx-glass-chrome {
  background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%);
  backdrop-filter: blur(60px) saturate(160%) brightness(105%);
  -webkit-backdrop-filter: blur(60px) saturate(160%) brightness(105%);
  border-bottom: 0.5px solid rgba(255,255,255,0.1);
}
.dnx-glass-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 0.5px solid rgba(255,255,255,0.1);
  box-shadow: 0 0 0 0.5px rgba(255,255,255,0.03) inset, 0 20px 40px rgba(0,0,0,0.6);
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.dnx-glass-card-hover:hover {
  transform: translateY(-6px) scale(1.01);
  box-shadow: 0 0 0 0.5px rgba(255,255,255,0.08) inset, 0 30px 80px rgba(0,0,0,0.7), 0 0 100px rgba(99,102,241,0.15);
  border-color: rgba(255,255,255,0.15);
  background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%);
}
.dnx-glass-input {
  background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 0.5px solid rgba(255,255,255,0.15);
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.dnx-glass-input:focus-within {
  border-color: rgba(99,102,241,0.5);
  box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
}
.dnx-icon {
  background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.08) 100%);
  border: 0.5px solid rgba(255,255,255,0.2);
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
@keyframes dnx-blur-in {
  0% { opacity: 0; filter: blur(10px); transform: scale(0.96); }
  100% { opacity: 1; filter: blur(0); transform: scale(1); }
}
@keyframes dnx-slide-up {
  0% { opacity: 0; transform: translateY(24px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes dnx-fade { 0% { opacity: 0; } 100% { opacity: 1; } }
.dnx-blur-in { animation: dnx-blur-in 0.9s cubic-bezier(0.25,0.46,0.45,0.94) forwards; }
.dnx-slide-up { animation: dnx-slide-up 0.7s cubic-bezier(0.25,0.46,0.45,0.94) forwards; opacity: 0; }
.dnx-fade { animation: dnx-fade 0.6s ease forwards; opacity: 0; }
.dnx-orbs::before, .dnx-orbs::after {
  content: ''; position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.4;
  animation: dnx-float 25s ease-in-out infinite; pointer-events: none;
}
.dnx-orbs::before {
  top: 12%; right: 18%; width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(99,102,241,0.30) 0%, transparent 70%); animation-delay: -8s;
}
.dnx-orbs::after {
  bottom: 22%; left: 12%; width: 350px; height: 350px;
  background: radial-gradient(circle, rgba(0,201,167,0.22) 0%, transparent 70%); animation-delay: -15s;
}
@keyframes dnx-float {
  0%,100% { transform: translateY(0) rotate(0deg); opacity: 0.4; }
  25% { transform: translateY(-40px) rotate(90deg); opacity: 0.6; }
  50% { transform: translateY(20px) rotate(180deg); opacity: 0.3; }
  75% { transform: translateY(-20px) rotate(270deg); opacity: 0.5; }
}
`;

/* ── Component ────────────────────────────────────────────── */

export default function DashboardNew() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>("week");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const year = period === "month" ? selectedYear : undefined;
  const month = period === "month" ? selectedMonth : undefined;

  const { data: overview, isLoading: overviewLoading } = useDashboardOverview(period, year, month);
  const { data: rawInsights } = useAiInsights();
  const { data: rawDoctors } = useDoctorsLoad();
  const { data: leaderboard } = useLeaderboard();
  const refreshInsights = useRefreshDashboardInsights();
  const user = useAuthStore((s) => s.user);

  const insightText = refreshInsights.isPending
    ? "Анализирую показатели клиники..."
    : summarizeInsights(refreshInsights.data ?? rawInsights);

  const kpi = overview?.kpi;
  const funnel = overview?.funnel ?? [];
  const sources = overview?.sources ?? [];
  const doctors = (rawDoctors?.doctors ?? []).map((d) => ({
    name: d.doctor_name,
    info: `${d.appointments} приёмов`,
    load_pct: d.load_pct,
  }));
  const fallbackDoctors = overview?.doctors_load ?? [];
  const doctorRows = doctors.length
    ? doctors
    : fallbackDoctors.map((d) => ({ name: d.name, info: d.spec, load_pct: d.load_pct }));
  const leaders = leaderboard?.items ?? [];

  const currentYear = now.getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const initials = (user?.name ?? "DF")
    .split(" ")
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const kpiCards = kpi
    ? [
        { label: "Новые лиды", value: String(kpi.new_leads), icon: Users, color: "#5b4cf5", delta: undefined as string | undefined, down: false },
        { label: "Записи", value: String(kpi.appointments_created), icon: CalendarCheck, color: "#3b7fed", delta: undefined, down: false },
        { label: "Подтверждено", value: String(kpi.appointments_confirmed), icon: CheckCircle, color: "#00c9a7", delta: `${kpi.conversion_rate}%`, down: false },
        { label: "Неявки", value: String(kpi.no_shows), icon: XCircle, color: "#f44b6e", delta: kpi.no_shows_delta !== 0 ? `${kpi.no_shows_delta > 0 ? "+" : ""}${kpi.no_shows_delta}` : undefined, down: kpi.no_shows_delta > 0 },
        { label: "Потеряно", value: String(kpi.leads_lost), icon: TrendingDown, color: "#f5a623", delta: kpi.leads_lost_delta !== 0 ? `${kpi.leads_lost_delta > 0 ? "+" : ""}${kpi.leads_lost_delta}` : undefined, down: kpi.leads_lost_delta > 0 },
        { label: "Выручка", value: formatRevenue(kpi.revenue_planned), icon: Banknote, color: "#00c9a7", delta: "+15%", down: false },
      ]
    : [];

  const navItems = [
    { to: "/", label: "Обзор", icon: Home, active: true },
    { to: "/patients", label: "Пациенты", icon: Users },
    { to: "/schedule", label: "Умная запись", icon: CalendarCheck },
    { to: "/communications", label: "Коммуникации", icon: MessageCircle },
    { to: "/analytics", label: "Финансы & KPI", icon: BarChart3 },
  ];

  return (
    <div className="dnx min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 text-white relative overflow-x-hidden">
      <style>{GLASS_STYLES}</style>

      {/* Ambient floating orbs */}
      <div className="fixed inset-0 -z-10 dnx-orbs pointer-events-none" />

      {/* Top tags */}
      <div className="flex flex-wrap justify-center gap-3 pt-8 px-4 text-sm font-medium dnx-fade" style={{ animationDelay: "0.1s" }}>
        <span className="px-5 py-2.5 rounded-full dnx-glass-card font-medium">DENTAFLOW</span>
        <span className="px-5 py-2.5 rounded-full backdrop-blur-sm border border-blue-500/30 bg-blue-600/20 text-blue-200 font-medium">AI POWERED</span>
        <span className="px-5 py-2.5 rounded-full dnx-glass-card font-medium">REAL-TIME CRM</span>
        <span className="px-5 py-2.5 rounded-full backdrop-blur-sm border border-emerald-500/30 bg-emerald-600/20 text-emerald-200 font-medium">PREVIEW</span>
      </div>

      {/* Main window */}
      <div className="flex-1 flex dnx-blur-in px-4 sm:px-6 pb-16 pt-10 items-start justify-center relative" style={{ animationDelay: "0.2s" }}>
        <div className="relative w-full max-w-[1400px] mt-6 dnx-glass-container rounded-3xl flex flex-col overflow-hidden shadow-2xl">

          {/* Browser chrome */}
          <div className="dnx-glass-chrome flex items-center justify-between h-16 px-6 relative z-10">
            <div className="flex items-center gap-2.5">
              <span className="w-3.5 h-3.5 rounded-full bg-red-500/90" />
              <span className="w-3.5 h-3.5 rounded-full bg-yellow-400/90" />
              <span className="w-3.5 h-3.5 rounded-full bg-green-500/90" />
            </div>
            <div className="flex-1 mx-8 max-w-lg">
              <div className="dnx-glass-input flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm">
                <Lock className="w-4 h-4 text-green-400" />
                <span className="flex-1 truncate font-medium text-white">dentaflow.app/dashboard</span>
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Bell className="w-5 h-5" />
            </div>
          </div>

          {/* Workspace */}
          <div className="flex flex-1 min-h-0 relative">

            {/* Sidebar */}
            <div className="dnx-glass-sidebar w-72 lg:w-80 hidden md:flex flex-col relative z-10">
              <div className="p-6 border-b border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="dnx-icon p-3 rounded-xl">
                      <Sparkles className="w-6 h-6 text-blue-300" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold text-white">DentaFlow</h1>
                      <p className="text-xs text-gray-400">Clinic Intelligence</p>
                    </div>
                  </div>
                  <button className="dnx-icon p-2.5 rounded-lg">
                    <Bell className="w-4 h-4 text-gray-300" />
                  </button>
                </div>

                <div className="dnx-glass-input flex items-center gap-3 rounded-xl px-4 py-3 text-sm">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Поиск пациентов, сделок..."
                    className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-400 text-sm"
                  />
                </div>
              </div>

              <div className="flex-1 p-4 space-y-2 overflow-y-auto">
                <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3 px-3">Навигация</h3>
                <nav className="space-y-1.5">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={
                          item.active
                            ? "flex items-center gap-4 px-4 py-3 rounded-xl bg-blue-500/15 border border-blue-500/20 text-blue-200 transition-all duration-200 hover:bg-blue-500/25"
                            : "flex items-center gap-4 px-4 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/8 transition-all duration-200"
                        }
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                        {item.active && <div className="ml-auto w-2 h-2 rounded-full bg-blue-400" />}
                      </Link>
                    );
                  })}
                </nav>

                {/* Live activity */}
                <div className="pt-6">
                  <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3 px-3">Воронка</h3>
                  <div className="space-y-2.5 px-1">
                    {funnel.slice(0, 4).map((f) => (
                      <div key={f.stage} className="px-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-300 truncate">{f.stage}</span>
                          <span className="text-xs text-gray-400 font-mono">{f.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${f.pct}%`, background: "linear-gradient(90deg,#6c5ce7,#3b7fed)" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* User profile */}
              <div className="p-4 border-t border-white/5">
                <div className="flex items-center gap-3 p-3 rounded-xl dnx-glass-card dnx-glass-card-hover cursor-pointer">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                    <span className="text-white font-semibold">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{user?.name ?? "DentaFlow"}</p>
                    <p className="text-xs text-gray-400 truncate">{user?.email ?? "—"}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-h-0 relative">

              {/* Header */}
              <div className="p-6 lg:p-8 border-b border-white/5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl lg:text-3xl font-bold text-white mb-1 tracking-tight">
                      С возвращением{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
                    </h2>
                    <p className="text-gray-400">Сводка по клинике • {getPeriodLabel(period, selectedYear, selectedMonth)}</p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex gap-1 dnx-glass-input rounded-xl p-1">
                      {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => setPeriod(p)}
                          className={
                            period === p
                              ? "px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-white/15 text-white"
                              : "px-4 py-1.5 rounded-lg text-[13px] font-semibold text-gray-300 hover:text-white"
                          }
                        >
                          {PERIOD_LABELS[p]}
                        </button>
                      ))}
                    </div>

                    {period === "month" && (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(Number(e.target.value))}
                          className="dnx-glass-input text-[13px] font-semibold rounded-lg px-3 py-2 text-white bg-transparent outline-none cursor-pointer [&>option]:text-gray-900"
                        >
                          {MONTH_NAMES.map((name, idx) => (
                            <option key={idx + 1} value={idx + 1}>{name}</option>
                          ))}
                        </select>
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(Number(e.target.value))}
                          className="dnx-glass-input text-[13px] font-semibold rounded-lg px-3 py-2 text-white bg-transparent outline-none cursor-pointer [&>option]:text-gray-900"
                        >
                          {yearOptions.map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 p-6 lg:p-8 overflow-y-auto">

                {/* AI insight banner */}
                <div
                  className="rounded-2xl p-6 relative overflow-hidden mb-8 dnx-slide-up"
                  style={{
                    animationDelay: "0.3s",
                    background: "linear-gradient(135deg, rgba(108,92,231,0.85) 0%, rgba(59,127,237,0.8) 60%, rgba(0,201,167,0.75) 100%)",
                    boxShadow: "0 20px 50px -15px rgba(91,76,245,0.45)",
                  }}
                >
                  <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20" style={{ background: "radial-gradient(circle,#fff 0%,transparent 70%)" }} />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-white" />
                        <span className="text-[11px] font-bold tracking-wider text-white/80 uppercase">ИИ-Ассистент</span>
                      </div>
                      <button
                        onClick={() => refreshInsights.mutate(period)}
                        disabled={refreshInsights.isPending}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-white/90 hover:bg-white/15 transition-all border border-white/25 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${refreshInsights.isPending ? "animate-spin" : ""}`} />
                        {refreshInsights.isPending ? "Обновляю..." : "Обновить"}
                      </button>
                    </div>
                    <p className="text-[15px] text-white font-semibold leading-relaxed" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.25)" }}>
                      {insightText}
                    </p>
                  </div>
                </div>

                {/* KPI grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8 dnx-slide-up" style={{ animationDelay: "0.4s" }}>
                  {overviewLoading && !kpi
                    ? [1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="dnx-glass-card rounded-2xl p-5 h-[120px] animate-pulse" />
                      ))
                    : kpiCards.map((c) => {
                        const Icon = c.icon;
                        return (
                          <div key={c.label} className="dnx-glass-card dnx-glass-card-hover rounded-2xl p-5 group">
                            <div className="flex items-center justify-between mb-3">
                              <div className="dnx-icon p-2.5 rounded-xl">
                                <Icon className="w-5 h-5" style={{ color: c.color }} />
                              </div>
                              {c.delta && (
                                <span className={`text-xs font-semibold ${c.down ? "text-red-400" : "text-green-400"}`}>
                                  {c.delta}
                                </span>
                              )}
                            </div>
                            <h3 className="text-xl font-bold text-white mb-0.5 leading-tight">{c.value}</h3>
                            <p className="text-xs text-gray-400">{c.label}</p>
                          </div>
                        );
                      })}
                </div>

                {/* Funnel + Sources */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8 dnx-slide-up" style={{ animationDelay: "0.5s" }}>
                  {/* Funnel */}
                  <div className="dnx-glass-card rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <Activity className="w-5 h-5 text-blue-300" />
                      <h3 className="text-lg font-bold text-white">Воронка пациентов</h3>
                    </div>
                    <div className="space-y-4">
                      {funnel.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Нет данных</p>
                      ) : (
                        funnel.map((item) => (
                          <div key={item.stage}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-medium text-gray-200">{item.stage}</span>
                              <span className="text-sm font-semibold text-gray-300">
                                {item.count} <span className="text-xs text-gray-500">({item.pct}%)</span>
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${item.pct}%`, background: "linear-gradient(90deg,#6c5ce7,#3b7fed)" }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Sources */}
                  <div className="dnx-glass-card rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <TrendingDown className="w-5 h-5 rotate-180 text-emerald-300" />
                      <h3 className="text-lg font-bold text-white">Источники лидов</h3>
                    </div>
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                          <th className="pb-3">Источник</th>
                          <th className="pb-3 text-right">Лиды</th>
                          <th className="pb-3 text-right">Конв.</th>
                          <th className="pb-3 text-right">CPL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sources.length === 0 ? (
                          <tr><td colSpan={4} className="py-4 text-center text-sm text-gray-400">Нет данных</td></tr>
                        ) : (
                          sources.map((s) => (
                            <tr key={s.channel} className="border-t border-white/5 text-sm">
                              <td className="py-2.5 font-medium text-gray-200">{s.channel}</td>
                              <td className="py-2.5 text-right font-semibold text-white">{s.leads}</td>
                              <td className="py-2.5 text-right font-semibold text-emerald-300">{s.conversion}%</td>
                              <td className="py-2.5 text-right text-gray-400">{s.cpl > 0 ? `${s.cpl} ₽` : "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Doctors load + Leaderboard */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 dnx-slide-up" style={{ animationDelay: "0.6s" }}>
                  {/* Doctors */}
                  <div className="dnx-glass-card rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <Stethoscope className="w-5 h-5 text-blue-300" />
                      <h3 className="text-lg font-bold text-white">Загрузка врачей</h3>
                    </div>
                    {doctorRows.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">Нет данных о приёмах</p>
                    ) : (
                      <div className="space-y-4">
                        {doctorRows.map((d) => (
                          <div key={d.name}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-semibold text-gray-200 truncate mr-3">{d.name}</span>
                              <span className="text-xs font-bold text-gray-300 flex-shrink-0">{d.info}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${d.load_pct}%`, backgroundColor: loadColor(d.load_pct) }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Leaderboard */}
                  <div className="dnx-glass-card rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <Trophy className="w-5 h-5 text-yellow-400" />
                      <h3 className="text-lg font-bold text-white">Рейтинг администраторов</h3>
                    </div>
                    {leaders.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">
                        Баллы ещё не начислялись. Рейтинг появится после первых задач.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {leaders.map((entry) => (
                          <div
                            key={entry.user_id}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
                          >
                            <span className="text-lg w-7 text-center">
                              {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                            </span>
                            {entry.avatar_url ? (
                              <img src={entry.avatar_url} alt={entry.name} className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}
                              >
                                {entry.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{entry.name}</p>
                              <p className="text-xs text-gray-400">{entry.tasks_completed} задач</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 text-yellow-400" />
                              <span className="text-sm font-bold text-white">{entry.total_points}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer link back */}
                <div className="mt-8 flex justify-center">
                  <Link
                    to="/"
                    className="flex items-center gap-2 text-blue-300 hover:text-blue-200 text-sm font-medium transition-colors"
                  >
                    Перейти к классическому дашборду
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
