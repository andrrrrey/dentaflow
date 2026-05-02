import { useState } from "react";
import { Calendar, Clock, Stethoscope, RefreshCw, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import Pill from "../ui/Pill";
import type { AppointmentResponse } from "../../api/patients";
import { useSyncPatient } from "../../api/patients";

interface MedHistoryProps {
  appointments: AppointmentResponse[];
  patientId: string;
  oneDentaVisitsCount?: number | null;
}

const statusMap: Record<string, { variant: "green" | "blue" | "yellow" | "red"; label: string }> = {
  completed: { variant: "green", label: "Завершён" },
  scheduled: { variant: "blue", label: "Запланирован" },
  confirmed: { variant: "blue", label: "Подтверждён" },
  cancelled: { variant: "red", label: "Отменён" },
  no_show: { variant: "red", label: "Неявка" },
};

function formatRevenue(v: number | null): string {
  if (v === null) return "---";
  return v.toLocaleString("ru-RU") + " ₽";
}

export default function MedHistory({ appointments, patientId, oneDentaVisitsCount }: MedHistoryProps) {
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const sync = useSyncPatient();

  const sorted = [...appointments].sort((a, b) => {
    const da = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
    const db = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
    return db - da;
  });

  const handleSync = () => {
    setSyncMsg(null);
    sync.mutate(patientId, {
      onSuccess: (res) => {
        if (res.ok) setSyncMsg(`Загружено ${res.synced} визитов из 1Denta`);
        else setSyncMsg(res.message ?? "Ошибка синхронизации");
      },
      onError: () => setSyncMsg("Ошибка подключения к 1Denta"),
    });
  };

  const showHint = appointments.length === 0 && oneDentaVisitsCount && oneDentaVisitsCount > 0;

  return (
    <div className="space-y-3">
      {/* Sync toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {showHint && (
            <span className="flex items-center gap-1.5 text-[12px] text-[#F5A623] font-semibold">
              <AlertCircle size={13} />
              В 1Denta {oneDentaVisitsCount} визитов — загрузите историю
            </span>
          )}
          {syncMsg && (
            <span className="text-[12px] text-[#00C9A7] font-semibold">{syncMsg}</span>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={sync.isPending}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-accent2 hover:opacity-70 transition-opacity disabled:opacity-40"
        >
          <RefreshCw size={13} className={sync.isPending ? "animate-spin" : ""} />
          {sync.isPending ? "Загружаем..." : "Загрузить из 1Denta"}
        </button>
      </div>

      {sorted.map((apt) => {
        const st = statusMap[apt.status ?? ""] ?? { variant: "yellow" as const, label: apt.status ?? "---" };
        return (
          <div
            key={apt.id}
            className="rounded-glass p-[16px_18px]"
            style={{
              background: "rgba(255,255,255,0.65)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Date block */}
              <div className="flex items-center gap-2 text-[13px] text-text-muted flex-shrink-0 w-[160px]">
                <Calendar size={14} />
                <span>
                  {apt.scheduled_at
                    ? format(new Date(apt.scheduled_at), "dd MMM yyyy, HH:mm", { locale: ru })
                    : "Не указана"}
                </span>
              </div>

              {/* Service & doctor */}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-text-main truncate">
                  {apt.service ?? "Без названия"}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[12px] text-text-muted">
                  <span className="flex items-center gap-1">
                    <Stethoscope size={12} />
                    {apt.doctor_name ?? "---"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {apt.duration_min} мин
                  </span>
                </div>
              </div>

              {/* Status & revenue */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <Pill variant={st.variant}>{st.label}</Pill>
                <span className="text-[13px] font-bold text-text-main min-w-[80px] text-right">
                  {formatRevenue(apt.revenue)}
                </span>
              </div>
            </div>
            {apt.comment && (
              <div className="mt-2 px-[10px] py-[6px] rounded-[8px] text-[12px] text-text-muted italic" style={{ background: "rgba(91,76,245,0.04)", borderLeft: "2px solid rgba(91,76,245,0.2)" }}>
                {apt.comment}
              </div>
            )}
          </div>
        );
      })}

      {sorted.length === 0 && !showHint && (
        <div className="text-center py-8 text-text-muted text-[13px]">
          Нет записей о визитах
        </div>
      )}
    </div>
  );
}
