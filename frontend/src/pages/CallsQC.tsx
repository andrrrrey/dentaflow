import { useState } from "react";
import StatCard from "../components/ui/StatCard";
import Pill from "../components/ui/Pill";
import Card from "../components/ui/Card";
import { Phone, BarChart3, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play } from "lucide-react";
import { useCalls } from "../api/calls";
import type { CallRecord } from "../api/calls";

/* ---------- helpers ---------- */

function formatDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function statusVariant(call: CallRecord): "green" | "yellow" | "red" {
  if (call.status === "missed" || call.duration === 0) return "red";
  if (call.duration < 30) return "yellow";
  return "green";
}

function statusLabel(call: CallRecord): string {
  if (call.status === "missed" || call.duration === 0) return "Пропущен";
  return "Отвечен";
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "outbound") return <PhoneOutgoing size={14} className="text-accent2" />;
  return <PhoneIncoming size={14} className="text-accent3" />;
}

/* ---------- component ---------- */

export default function CallsQC() {
  const [days, setDays] = useState(7);
  const [filterStatus, setFilterStatus] = useState("");

  const { data, isLoading } = useCalls({
    days,
    status: filterStatus || undefined,
  });

  const calls = data?.calls ?? [];
  const stats = data?.stats;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-[14px]">
        <StatCard
          label="Всего звонков"
          value={String(stats?.total ?? 0)}
          icon={<Phone size={18} className="text-accent2" />}
        />
        <StatCard
          label="Отвечено"
          value={String(stats?.answered ?? 0)}
          icon={<PhoneIncoming size={18} className="text-accent3" />}
        />
        <StatCard
          label="Пропущено"
          value={String(stats?.missed ?? 0)}
          icon={<PhoneMissed size={18} className="text-[#f44b6e]" />}
        />
        <StatCard
          label="% ответов"
          value={`${stats?.answer_rate ?? 0}%`}
          icon={<BarChart3 size={18} className="text-accent2" />}
        />
      </div>

      {/* Filters + table */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-[15px] font-bold text-text-main">История звонков</h2>

          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-auto rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}
          >
            <option value={3}>3 дня</option>
            <option value={7}>7 дней</option>
            <option value={14}>14 дней</option>
            <option value={30}>30 дней</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}
          >
            <option value="">Все статусы</option>
            <option value="answered">Отвечено</option>
            <option value="missed">Пропущено</option>
          </select>
        </div>

        {isLoading ? (
          <div className="text-center text-text-muted py-12 text-[13px]">Загрузка данных...</div>
        ) : calls.length === 0 ? (
          <div className="text-center text-text-muted py-12 text-[13px]">Нет звонков за выбранный период</div>
        ) : (
          <div className="overflow-x-auto">
            {/* Header */}
            <div className="hidden md:grid grid-cols-[90px_40px_1fr_1fr_80px_100px_60px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
              {["Дата", "", "Откуда", "Куда", "Длит.", "Статус", ""].map((h) => (
                <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {calls.map((call) => (
              <div
                key={call.call_id}
                className="md:grid md:grid-cols-[90px_40px_1fr_1fr_80px_100px_60px] gap-3 px-[14px] py-[11px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors flex flex-col"
              >
                <div className="flex flex-col">
                  <span className="text-[12.5px] text-text-main font-medium">{formatDate(call.started_at)}</span>
                  <span className="text-[11px] text-text-muted">{formatTime(call.started_at)}</span>
                </div>
                <div className="flex items-center">
                  <DirectionIcon direction={call.direction} />
                </div>
                <span className="text-[13px] text-text-main font-medium font-mono">{call.caller_id || "—"}</span>
                <span className="text-[13px] text-text-muted font-mono">{call.called_did || "—"}</span>
                <span className="text-[12.5px] text-text-muted">{formatDuration(call.duration)}</span>
                <span>
                  <Pill variant={statusVariant(call)}>
                    {statusLabel(call)}
                  </Pill>
                </span>
                <div className="flex items-center">
                  {call.recording_url && (
                    <a
                      href={call.recording_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent2 hover:text-accent"
                      title="Прослушать запись"
                    >
                      <Play size={16} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
