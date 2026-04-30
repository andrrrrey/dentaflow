import { useState } from "react";
import { createPortal } from "react-dom";
import { format, startOfWeek, addDays, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarDays, List, ChevronLeft, ChevronRight, Plus, X, RefreshCw } from "lucide-react";
import Card from "../components/ui/Card";
import Pill from "../components/ui/Pill";
import StatCard from "../components/ui/StatCard";
import Button from "../components/ui/Button";
import { useSchedule, useCreateAppointment, useDoctorsList, useSyncSchedule } from "../api/schedule";
import type { Appointment, CreateAppointmentData } from "../api/schedule";
import AppointmentDetailModal from "../components/schedule/AppointmentDetailModal";

/* -- Status helpers -- */

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

/* -- Calendar view -- */

const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i);

function CalendarView({ appointments, weekStart, onSelectAppointment }: { appointments: Appointment[]; weekStart: Date; onSelectAppointment: (id: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function getAppts(day: Date, hour: number): Appointment[] {
    return appointments.filter((a) => {
      if (!a.scheduled_at) return false;
      try {
        const d = parseISO(a.scheduled_at);
        return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate() && d.getHours() === hour;
      } catch { return false; }
    });
  }

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 700 }}>
        <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className="text-center text-[12px] font-bold py-2 border-b border-[rgba(91,76,245,0.08)]">
              <div className="text-text-muted">{format(d, "EEE", { locale: ru })}</div>
              <div className={`text-[15px] mt-px ${format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "text-accent2" : ""}`}>
                {format(d, "d")}
              </div>
            </div>
          ))}
        </div>
        {HOURS.map((h) => (
          <div key={h} className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)", minHeight: 56 }}>
            <div className="text-[11px] text-text-muted text-right pr-2 pt-1">{h}:00</div>
            {days.map((d) => {
              const appts = getAppts(d, h);
              return (
                <div key={d.toISOString()} className="border-l border-b border-[rgba(91,76,245,0.06)] p-[2px] min-h-[56px]">
                  {appts.map((a) => (
                    <div
                      key={a.id}
                      className="text-[10.5px] p-1 rounded-[6px] mb-[2px] truncate font-medium cursor-pointer hover:opacity-80"
                      style={{
                        background: a.status === "confirmed" ? "rgba(0,201,167,0.15)" : a.status === "cancelled" ? "rgba(244,75,110,0.12)" : "rgba(91,76,245,0.12)",
                        color: a.status === "confirmed" ? "#007d6e" : a.status === "cancelled" ? "#c52048" : "#4834d4",
                      }}
                      title={`${a.patient_name} — ${a.service}`}
                      onClick={() => onSelectAppointment(a.id)}
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

/* -- Table view -- */

function TableView({ appointments, onSelectAppointment }: { appointments: Appointment[]; onSelectAppointment: (id: string) => void }) {
  if (!appointments.length) {
    return <div className="text-center text-text-muted py-12 text-[13px]">Нет записей на выбранный период</div>;
  }
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {["Время", "Врач", "Пациент", "Услуга", "Кабинет", "Статус"].map((h) => (
            <th key={h} className="text-left text-[10.5px] font-bold text-text-muted uppercase tracking-[0.8px] pb-[10px] px-[12px]" style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {appointments.map((a) => (
          <tr key={a.id} className="hover:bg-[rgba(91,76,245,0.03)] cursor-pointer" style={{ borderBottom: "1px solid rgba(91,76,245,0.05)" }} onClick={() => onSelectAppointment(a.id)}>
            <td className="py-[10px] px-[12px] font-mono text-[12.5px] font-semibold">{timeOf(a.scheduled_at)}</td>
            <td className="py-[10px] px-[12px] text-[13px]">{a.doctor_name || "—"}</td>
            <td className="py-[10px] px-[12px]">
              <div className="text-[13px] font-semibold">{a.patient_name}</div>
              {a.patient_phone && <div className="text-[11px] text-text-muted">{a.patient_phone}</div>}
            </td>
            <td className="py-[10px] px-[12px] text-[12px] text-text-muted max-w-[180px] truncate">{a.service || "—"}</td>
            <td className="py-[10px] px-[12px] text-[12px] text-text-muted">{a.branch || "—"}</td>
            <td className="py-[10px] px-[12px]">
              <Pill variant={statusVariant[a.status ?? ""] ?? "gray"}>{statusLabels[a.status ?? ""] ?? a.status ?? "—"}</Pill>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -- Add Appointment Modal -- */

function AddAppointmentModal({ onClose, doctors }: { onClose: () => void; doctors: { doctor_id: string; doctor_name: string }[] }) {
  const createMutation = useCreateAppointment();
  const [form, setForm] = useState<CreateAppointmentData>({
    patient_name: "",
    patient_phone: "",
    doctor_id: doctors[0]?.doctor_id ?? "",
    doctor_name: doctors[0]?.doctor_name ?? "",
    service: "",
    scheduled_at: "",
    duration_min: 30,
    comment: "",
  });
  const [error, setError] = useState("");

  function set(key: keyof CreateAppointmentData, val: string | number) {
    setForm((p) => ({ ...p, [key]: val }));
    if (key === "doctor_id") {
      const doc = doctors.find((d) => d.doctor_id === val);
      if (doc) setForm((p) => ({ ...p, doctor_id: doc.doctor_id, doctor_name: doc.doctor_name }));
    }
  }

  async function handleSubmit() {
    if (!form.patient_name || !form.patient_phone || !form.scheduled_at) {
      setError("Заполните обязательные поля");
      return;
    }
    setError("");
    try {
      await createMutation.mutateAsync(form);
      onClose();
    } catch {
      setError("Ошибка при создании записи");
    }
  }

  const inputStyle = {
    border: "1px solid rgba(91,76,245,0.15)",
    background: "rgba(255,255,255,0.5)",
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-[480px] rounded-[20px] p-6 flex flex-col gap-4"
        style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(91,76,245,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">Новая запись</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Имя пациента *</label>
            <input value={form.patient_name} onChange={(e) => set("patient_name", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Иванов Иван" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Телефон *</label>
            <input value={form.patient_phone} onChange={(e) => set("patient_phone", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="+7 (999) 123-45-67" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Врач</label>
            <select value={form.doctor_id} onChange={(e) => set("doctor_id", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer" style={inputStyle}>
              {doctors.length === 0 && <option value="">Нет врачей</option>}
              {doctors.map((d) => <option key={d.doctor_id} value={d.doctor_id}>{d.doctor_name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Услуга</label>
            <input value={form.service} onChange={(e) => set("service", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Консультация" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Дата и время *</label>
              <input type="datetime-local" value={form.scheduled_at} onChange={(e) => set("scheduled_at", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Длительность (мин)</label>
              <input type="number" value={form.duration_min} onChange={(e) => set("duration_min", Number(e.target.value))} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Комментарий</label>
            <textarea value={form.comment} onChange={(e) => set("comment", e.target.value)} rows={2} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none resize-none" style={inputStyle} placeholder="Дополнительная информация" />
          </div>
        </div>

        {error && <div className="text-[12px] text-[#c52048] font-medium">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Отмена</Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={createMutation.isPending}>
            <Plus size={14} className="mr-1" />
            {createMutation.isPending ? "Создание..." : "Создать запись"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* -- Component -- */

export default function Schedule() {
  const [view, setView] = useState<"table" | "calendar">("table");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const dateFrom = format(weekStart, "yyyy-MM-dd");
  const dateTo = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data, isLoading } = useSchedule({ date_from: dateFrom, date_to: dateTo, doctor: filterDoctor || undefined, status: filterStatus || undefined });
  const { data: doctorsData } = useDoctorsList();
  const syncMutation = useSyncSchedule();

  const appointments = data?.appointments ?? [];
  const stats = data?.stats;
  const totalRevenue = appointments.reduce((s, a) => s + a.revenue, 0);
  const doctors = [...new Set(appointments.map((a) => a.doctor_name).filter(Boolean))];

  const doctorsList = (doctorsData?.doctors ?? []).map((d) => ({ doctor_id: d.doctor_id, doctor_name: d.doctor_name }));

  return (
    <div className="flex flex-col gap-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Всего записей" value={String(stats?.total ?? 0)} icon="📅" />
        <StatCard label="Подтверждено" value={String(stats?.confirmed ?? 0)} delta={stats?.completion_rate ? `${stats.completion_rate}%` : undefined} deltaType="up" icon="✅" />
        <StatCard label="Отменено" value={String(stats?.cancelled ?? 0)} icon="❌" />
        <StatCard label="Выручка" value={totalRevenue.toLocaleString("ru-RU") + " ₽"} icon="💰" />
      </div>

      {/* Controls + content */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Add button */}
          <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
            <Plus size={14} className="mr-[5px]" />
            Добавить запись
          </Button>

          {/* Sync button */}
          <Button variant="secondary" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw size={14} className={`mr-[5px] ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Синхронизация..." : "Синхронизировать"}
          </Button>

          {/* View toggle */}
          <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)]">
            <button onClick={() => setView("table")} className={`flex items-center gap-1 px-3 py-[5px] rounded-[9px] text-[12px] font-semibold transition-all border-none ${view === "table" ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]" : "text-text-muted bg-transparent cursor-pointer"}`}>
              <List size={13} /> Таблица
            </button>
            <button onClick={() => setView("calendar")} className={`flex items-center gap-1 px-3 py-[5px] rounded-[9px] text-[12px] font-semibold transition-all border-none ${view === "calendar" ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]" : "text-text-muted bg-transparent cursor-pointer"}`}>
              <CalendarDays size={13} /> Календарь
            </button>
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="w-8 h-8 rounded-[9px] bg-[rgba(91,76,245,0.08)] flex items-center justify-center text-text-muted hover:bg-[rgba(91,76,245,0.15)] border-none cursor-pointer">
              <ChevronLeft size={14} />
            </button>
            <span className="text-[13px] font-semibold">
              {format(weekStart, "d MMM", { locale: ru })} – {format(addDays(weekStart, 6), "d MMM yyyy", { locale: ru })}
            </span>
            <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="w-8 h-8 rounded-[9px] bg-[rgba(91,76,245,0.08)] flex items-center justify-center text-text-muted hover:bg-[rgba(91,76,245,0.15)] border-none cursor-pointer">
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Doctor filter */}
          {doctors.length > 0 && (
            <select value={filterDoctor} onChange={(e) => setFilterDoctor(e.target.value)} className="rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none cursor-pointer" style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}>
              <option value="">Все врачи</option>
              {doctors.map((d) => <option key={d} value={d!}>{d}</option>)}
            </select>
          )}

          {/* Status filter */}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none cursor-pointer" style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}>
            <option value="">Все статусы</option>
            {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="text-center text-text-muted py-12 text-[13px]">Загрузка данных...</div>
        ) : view === "table" ? (
          <TableView appointments={appointments} onSelectAppointment={setSelectedAppointmentId} />
        ) : (
          <CalendarView appointments={appointments} weekStart={weekStart} onSelectAppointment={setSelectedAppointmentId} />
        )}
      </Card>

      {/* Add appointment modal */}
      {showAddModal && (
        <AddAppointmentModal
          onClose={() => setShowAddModal(false)}
          doctors={doctorsList.length > 0 ? doctorsList : [{ doctor_id: "DOC-01", doctor_name: "Врач не указан" }]}
        />
      )}

      {/* Appointment detail modal */}
      {selectedAppointmentId && (
        <AppointmentDetailModal
          appointmentId={selectedAppointmentId}
          onClose={() => setSelectedAppointmentId(null)}
        />
      )}
    </div>
  );
}
