import { useState } from "react";
import { format, startOfWeek, addDays, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarDays, List, ChevronLeft, ChevronRight } from "lucide-react";
import Card from "../components/ui/Card";
import Pill from "../components/ui/Pill";
import StatCard from "../components/ui/StatCard";
import { useSchedule } from "../api/schedule";
import type { Appointment } from "../api/schedule";

/* ── Status helpers ──────────────────────────────────────── */

const statusLabels: Record<string, string> = {
  confirmed: "Подтверждено",
  unconfirmed: "Не подтверждено",
  arrived: "Пришёл",
  completed: "Завершено",
  cancelled: "Отменено",
  no_show: "Не явился",
};

const statusVariant: Record<string, "green" | "blue" | "yellow" | "red" | "purple" | "gray"> = {
  confirmed: "green",
  unconfirmed: "blue",
  arrived: "purple",
  completed: "purple",
  cancelled: "red",
  no_show: "yellow",
};

function timeOf(isoStr: string | null): string {
  if (!isoStr) return "—";
  try { return format(parseISO(isoStr), "HH:mm"); } catch { return "—"; }
}

/* ── Calendar view ───────────────────────────────────────── */

const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i);

function CalendarView({ appointments, weekStart }: { appointments: Appointment[]; weekStart: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function getAppts(day: Date, hour: number): Appointment[] {
    return appointments.filter((a) => {
      if (!a.scheduled_at) return false;
      try {
        const d = parseISO(a.scheduled_at);
        return (
          d.getFullYear() === day.getFullYear() &&
          d.getMonth() === day.getMonth() &&
          d.getDate() === day.getDate() &&
          d.getHours() === hour
        );
      } catch { return false; }
    });
  }

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 700 }}>
        <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
          <div />
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className="text-center text-[12px] font-bold py-2 border-b border-[rgba(91,76,245,0.08)]"
            >
              <div className="text-text-muted">{format(d, "EEE", { locale: ru })}</div>
              <div className={`text-[15px] mt-px ${format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "text-accent2" : ""}`}>
                {format(d, "d")}
              </div>
            </div>
          ))}
        </div>
        {HOURS.map((h) => (
          <div
            key={h}
            className="grid"
            style={{ gridTemplateColumns: "60px repeat(7, 1fr)", minHeight: 56 }}
          >
            <div className="text-[11px] text-text-muted text-right pr-2 pt-1">{h}:00</div>
            {days.map((d) => {
              const appts = getAppts(d, h);
              return (
                <div
                  key={d.toISOString()}
                  className="border-l border-b border-[rgba(91,76,245,0.06)] p-[2px] min-h-[56px]"
                >
                  {appts.map((a) => (
                    <div
                      key={a.id}
                      className="text-[10.5px] p-1 rounded-[6px] mb-[2px] truncate font-medium"
                      style={{
                        background: a.status === "confirmed"
                          ? "rgba(0,201,167,0.15)"
                          : a.status === "cancelled"
                          ? "rgba(244,75,110,0.12)"
                          : "rgba(91,76,245,0.12)",
                        color: a.status === "confirmed" ? "#007d6e" : a.status === "cancelled" ? "#c52048" : "#4834d4",
                      }}
                      title={`${a.patient_name} — ${a.service}`}
                    >
                      {a.patient_name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Table view ──────────────────────────────────────────── */

function TableView({ appointments }: { appointments: Appointment[] }) {
  if (!appointments.length) {
    return (
      <div className="text-center text-text-muted py-12 text-[13px]">
        Нет записей на выбранный период
      </div>
    );
  }
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {["Время", "Врач", "Пациент", "Услуга", "Кабинет", "Статус"].map((h) => (
            <th
              key={h}
              className="text-left text-[10.5px] font-bold text-text-muted uppercase tracking-[0.8px] pb-[10px] px-[12px]"
              style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {appointments.map((a) => (
          <tr key={a.id} className="hover:bg-[rgba(91,76,245,0.03)]" style={{ borderBottom: "1px solid rgba(91,76,245,0.05)" }}>
            <td className="py-[10px] px-[12px] font-mono text-[12.5px] font-semibold">
              {timeOf(a.scheduled_at)}
            </td>
            <td className="py-[10px] px-[12px] text-[13px]">{a.doctor_name || "—"}</td>
            <td className="py-[10px] px-[12px]">
              <div className="text-[13px] font-semibold">{a.patient_name}</div>
              {a.patient_phone && (
                <div className="text-[11px] text-text-muted">{a.patient_phone}</div>
              )}
            </td>
            <td className="py-[10px] px-[12px] text-[12px] text-text-muted max-w-[180px] truncate">
              {a.service || "—"}
            </td>
            <td className="py-[10px] px-[12px] text-[12px] text-text-muted">
              {a.branch || "—"}
            </td>
            <td className="py-[10px] px-[12px]">
              <Pill variant={statusVariant[a.status ?? ""] ?? "gray"}>
                {statusLabels[a.status ?? ""] ?? a.status ?? "—"}
              </Pill>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Component ───────────────────────────────────────────── */

export default function Schedule() {
  const [view, setView] = useState<"table" | "calendar">("table");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const dateFrom = format(weekStart, "yyyy-MM-dd");
  const dateTo = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data, isLoading } = useSchedule({
    date_from: dateFrom,
    date_to: dateTo,
    doctor: filterDoctor || undefined,
    status: filterStatus || undefined,
  });

  const appointments = data?.appointments ?? [];
  const stats = data?.stats;
  const totalRevenue = appointments.reduce((s, a) => s + a.revenue, 0);

  const doctors = [...new Set(appointments.map((a) => a.doctor_name).filter(Boolean))];

  return (
    <div className="flex flex-col gap-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Всего записей" value={String(stats?.total ?? 0)} icon="📅" />
        <StatCard
          label="Подтверждено"
          value={String(stats?.confirmed ?? 0)}
          delta={stats?.completion_rate ? `${stats.completion_rate}%` : undefined}
          deltaType="up"
          icon="✅"
        />
        <StatCard label="Отменено" value={String(stats?.cancelled ?? 0)} icon="❌" />
        <StatCard
          label="Выручка"
          value={totalRevenue.toLocaleString("ru-RU") + " ₽"}
          icon="💰"
        />
      </div>

      {/* Controls + content */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* View toggle */}
          <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)]">
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1 px-3 py-[5px] rounded-[9px] text-[12px] font-semibold transition-all border-none ${view === "table" ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]" : "text-text-muted bg-transparent cursor-pointer"}`}
            >
              <List size={13} /> Таблица
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1 px-3 py-[5px] rounded-[9px] text-[12px] font-semibold transition-all border-none ${view === "calendar" ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]" : "text-text-muted bg-transparent cursor-pointer"}`}
            >
              <CalendarDays size={13} /> Календарь
            </button>
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart((w) => addDays(w, -7))}
              className="w-8 h-8 rounded-[9px] bg-[rgba(91,76,245,0.08)] flex items-center justify-center text-text-muted hover:bg-[rgba(91,76,245,0.15)] border-none cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[13px] font-semibold">
              {format(weekStart, "d MMM", { locale: ru })} – {format(addDays(weekStart, 6), "d MMM yyyy", { locale: ru })}
            </span>
            <button
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              className="w-8 h-8 rounded-[9px] bg-[rgba(91,76,245,0.08)] flex items-center justify-center text-text-muted hover:bg-[rgba(91,76,245,0.15)] border-none cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Doctor filter */}
          {doctors.length > 0 && (
            <select
              value={filterDoctor}
              onChange={(e) => setFilterDoctor(e.target.value)}
              className="rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none cursor-pointer"
              style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}
            >
              <option value="">Все врачи</option>
              {doctors.map((d) => <option key={d} value={d!}>{d}</option>)}
            </select>
          )}

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}
          >
            <option value="">Все статусы</option>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="text-center text-text-muted py-12 text-[13px]">Загрузка данных...</div>
        ) : view === "table" ? (
          <TableView appointments={appointments} />
        ) : (
          <CalendarView appointments={appointments} weekStart={weekStart} />
        )}
      </Card>
    </div>
  );
}
