import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import type { PatientStats as StatsType } from "../../api/patients";
import { TrendingUp, Calendar, UserCheck, Stethoscope, XCircle, AlertTriangle, Database } from "lucide-react";

interface Props {
  stats: StatsType;
  rawData: Record<string, unknown> | null;
}

function StatTile({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div
      className="rounded-[16px] p-[14px_16px] flex flex-col gap-2"
      style={{
        background: "rgba(255,255,255,0.70)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{label}</span>
        <span className="opacity-60">{icon}</span>
      </div>
      <div className="text-[22px] font-extrabold text-text-main leading-none">{value}</div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

function fmt(dt: string | null): string {
  if (!dt) return "—";
  try { return format(parseISO(dt), "d MMM yyyy", { locale: ru }); } catch { return dt; }
}

export default function PatientStats({ stats, rawData }: Props) {
  const showRaw = rawData && Object.keys(rawData).length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile label="Всего визитов" value={stats.total_visits} icon={<Calendar size={16} className="text-accent2" />} />
        <StatTile label="Завершено" value={stats.completed_visits} icon={<UserCheck size={16} className="text-[#00C9A7]" />} />
        <StatTile label="Отменено" value={stats.cancelled_visits} icon={<XCircle size={16} className="text-[#F5A623]" />} />
        <StatTile label="Неявок" value={stats.no_show_visits} icon={<AlertTriangle size={16} className="text-[#f44b6e]" />} />
        <StatTile label="Врачей" value={stats.unique_doctors} icon={<Stethoscope size={16} className="text-accent2" />} />
        <StatTile label="Услуг" value={stats.unique_services} icon={<Stethoscope size={16} className="text-[#3B7FED]" />} />
      </div>

      {/* Revenue */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Суммарная выручка"
          value={`${stats.total_revenue.toLocaleString("ru-RU")} ₽`}
          icon={<TrendingUp size={16} className="text-accent2" />}
        />
        <StatTile
          label="Средний чек"
          value={stats.avg_revenue_per_visit > 0 ? `${Math.round(stats.avg_revenue_per_visit).toLocaleString("ru-RU")} ₽` : "—"}
          icon={<TrendingUp size={16} className="text-[#3B7FED]" />}
        />
      </div>

      {/* Visit dates */}
      <div
        className="rounded-[16px] p-[14px_16px] grid grid-cols-2 gap-4"
        style={{
          background: "rgba(255,255,255,0.70)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
        }}
      >
        <div>
          <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider mb-1">Первый визит</div>
          <div className="text-[14px] font-bold text-text-main">{fmt(stats.first_visit_at)}</div>
        </div>
        <div>
          <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider mb-1">Последний визит</div>
          <div className="text-[14px] font-bold text-text-main">{fmt(stats.last_visit_at)}</div>
        </div>
      </div>

      {/* Raw 1denta data */}
      {showRaw && (
        <div
          className="rounded-[16px] p-[14px_16px] flex flex-col gap-3"
          style={{
            background: "rgba(255,255,255,0.70)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
          }}
        >
          <div className="flex items-center gap-2 text-[12px] font-bold text-text-muted">
            <Database size={14} />
            Данные из 1Denta
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(rawData!).map(([key, val]) => {
              if (val === null || val === undefined || val === "") return null;
              if (typeof val === "object") return null;
              return (
                <div key={key} className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wide">{key}</span>
                  <span className="text-[12.5px] text-text-main font-medium">{String(val)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
