import { useState, useMemo } from "react";
import { format, parseISO, addDays, subDays, startOfMonth, endOfMonth, startOfWeek, addMonths, subMonths, isSameDay, isSameMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import StatCard from "../components/ui/StatCard";
import Button from "../components/ui/Button";
import { useSchedule, useDoctorsList, useSyncSchedule } from "../api/schedule";
import type { Appointment } from "../api/schedule";
import AppointmentDetailModal from "../components/schedule/AppointmentDetailModal";
import AddAppointmentModal from "../components/schedule/AddAppointmentModal";

const statusLabels: Record<string, string> = {
  confirmed: "Подтверждено",
  unconfirmed: "Не подтверждено",
  arrived: "Пришёл",
  completed: "Завершено",
  cancelled: "Отменено",
  no_show: "Не явился",
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  confirmed: { bg: "rgba(0,201,167,0.13)", text: "#007d6e", border: "rgba(0,201,167,0.3)" },
  unconfirmed: { bg: "rgba(59,127,237,0.12)", text: "#2563eb", border: "rgba(59,127,237,0.25)" },
  arrived: { bg: "rgba(91,76,245,0.12)", text: "#5B4CF5", border: "rgba(91,76,245,0.25)" },
  completed: { bg: "rgba(91,76,245,0.12)", text: "#5B4CF5", border: "rgba(91,76,245,0.25)" },
  cancelled: { bg: "rgba(244,75,110,0.1)", text: "#c52048", border: "rgba(244,75,110,0.2)" },
  no_show: { bg: "rgba(245,166,35,0.12)", text: "#b45309", border: "rgba(245,166,35,0.25)" },
};

const CLINIC_START = 9;
const CLINIC_END = 20;
const HOURS = Array.from({ length: CLINIC_END - CLINIC_START + 1 }, (_, i) => CLINIC_START + i);
const SLOT_HEIGHT = 60;

function MiniCalendar({ selected, onSelect, calendarMonth, onChangeMonth }: {
  selected: Date;
  onSelect: (d: Date) => void;
  calendarMonth: Date;
  onChangeMonth: (d: Date) => void;
}) {
  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const days: Date[] = [];
  let d = calStart;
  while (d <= monthEnd || days.length % 7 !== 0) {
    days.push(d);
    d = addDays(d, 1);
  }
  const weekDays = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onChangeMonth(subMonths(calendarMonth, 1))} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[rgba(91,76,245,0.08)] border-none cursor-pointer bg-transparent text-text-muted">
          <ChevronLeft size={14} />
        </button>
        <span className="text-[13px] font-bold capitalize">
          {format(calendarMonth, "LLLL yyyy", { locale: ru })}
        </span>
        <button onClick={() => onChangeMonth(addMonths(calendarMonth, 1))} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[rgba(91,76,245,0.08)] border-none cursor-pointer bg-transparent text-text-muted">
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {weekDays.map((wd) => (
          <div key={wd} className="text-[10px] font-bold text-text-muted text-center py-1">{wd}</div>
        ))}
        {days.map((day, i) => {
          const isToday = isSameDay(day, new Date());
          const isSelected = isSameDay(day, selected);
          const isCurrentMonth = isSameMonth(day, calendarMonth);
          return (
            <button
              key={i}
              onClick={() => onSelect(day)}
              className="w-8 h-8 flex items-center justify-center text-[12px] rounded-lg border-none cursor-pointer transition-all"
              style={{
                background: isSelected ? "linear-gradient(135deg, #5B4CF5, #3B7FED)" : isToday ? "rgba(91,76,245,0.1)" : "transparent",
                color: isSelected ? "#fff" : !isCurrentMonth ? "rgba(120,130,150,0.4)" : isToday ? "#5B4CF5" : "#1e293b",
                fontWeight: isToday || isSelected ? 700 : 400,
              }}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => { onSelect(new Date()); onChangeMonth(new Date()); }}
        className="mt-2 w-full text-[12px] font-semibold text-accent2 hover:underline border-none bg-transparent cursor-pointer py-1"
      >
        Сегодня {format(new Date(), "d.MM")}
      </button>
    </div>
  );
}

function AppointmentBlock({ appt, onClick }: { appt: Appointment; onClick: () => void }) {
  if (!appt.scheduled_at) return null;
  const start = parseISO(appt.scheduled_at);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const clinicStartMin = CLINIC_START * 60;
  const top = ((startMin - clinicStartMin) / 60) * SLOT_HEIGHT;
  const height = Math.max((appt.duration_min / 60) * SLOT_HEIGHT - 2, 24);
  const colors = statusColors[appt.status ?? ""] ?? statusColors.unconfirmed;

  return (
    <div
      className="absolute left-[2px] right-[2px] rounded-lg cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        background: colors.bg,
        borderLeft: `3px solid ${colors.border}`,
        zIndex: 10,
      }}
      onClick={onClick}
    >
      <div className="px-2 py-1 h-full flex flex-col justify-start overflow-hidden">
        <div className="text-[10px] font-mono font-semibold" style={{ color: colors.text }}>
          {format(start, "HH:mm")} – {format(new Date(start.getTime() + appt.duration_min * 60000), "HH:mm")}
        </div>
        <div className="text-[11px] font-bold text-text-main truncate leading-tight mt-[1px]">
          {appt.patient_name}
        </div>
        {height > 44 && appt.patient_phone && (
          <div className="text-[10px] text-text-muted truncate">{appt.patient_phone}</div>
        )}
        {height > 58 && appt.service && (
          <div className="text-[10px] text-text-muted truncate mt-auto">{appt.service}</div>
        )}
      </div>
    </div>
  );
}

export default function Schedule() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data, isLoading } = useSchedule({
    date_from: dateStr,
    date_to: dateStr,
    doctor: filterDoctor || undefined,
    status: filterStatus || undefined,
  });
  const { data: doctorsData } = useDoctorsList();
  const syncMutation = useSyncSchedule();

  const appointments = data?.appointments ?? [];
  const stats = data?.stats;
  const totalRevenue = appointments.reduce((s, a) => s + a.revenue, 0);

  const doctorsWithAppointments = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of appointments) {
      const doc = appt.doctor_name || "Без врача";
      if (!map.has(doc)) map.set(doc, []);
      map.get(doc)!.push(appt);
    }
    const entries = Array.from(map.entries());
    entries.sort((a, b) => a[0].localeCompare(b[0], "ru"));
    return entries;
  }, [appointments]);

  const allDoctors = useMemo(() => {
    const names = new Set<string>();
    if (doctorsData?.doctors) {
      for (const d of doctorsData.doctors) names.add(d.doctor_name);
    }
    for (const appt of appointments) {
      if (appt.doctor_name) names.add(appt.doctor_name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ru"));
  }, [doctorsData, appointments]);

  const gridHeight = HOURS.length * SLOT_HEIGHT;

  return (
    <div className="flex flex-col gap-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Всего записей" value={String(stats?.total ?? 0)} icon="📅" />
        <StatCard label="Подтверждено" value={String(stats?.confirmed ?? 0)} delta={stats?.completion_rate ? `${stats.completion_rate}%` : undefined} deltaType="up" icon="✅" />
        <StatCard label="Отменено" value={String(stats?.cancelled ?? 0)} icon="❌" />
        <StatCard label="Выручка" value={totalRevenue.toLocaleString("ru-RU") + " ₽"} icon="💰" />
      </div>

      {/* Main layout: sidebar + timetable */}
      <div className="flex gap-4">
        {/* Left sidebar: mini calendar + filters */}
        <div
          className="w-[240px] flex-shrink-0 rounded-[16px] p-4 flex flex-col gap-4 self-start sticky top-4"
          style={{
            background: "rgba(255,255,255,0.65)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 18px rgba(120,140,180,0.18)",
          }}
        >
          <MiniCalendar
            selected={selectedDate}
            onSelect={(d) => { setSelectedDate(d); }}
            calendarMonth={calendarMonth}
            onChangeMonth={setCalendarMonth}
          />

          <div className="flex flex-col gap-2 pt-2" style={{ borderTop: "1px solid rgba(91,76,245,0.08)" }}>
            <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)} className="w-full">
              <Plus size={14} className="mr-[5px]" />
              Добавить запись
            </Button>
            <Button variant="secondary" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="w-full">
              <RefreshCw size={14} className={`mr-[5px] ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Запрос..." : syncMutation.isSuccess ? "Запущено ✓" : "Синхронизировать"}
            </Button>
          </div>

          <div className="flex flex-col gap-2 pt-2" style={{ borderTop: "1px solid rgba(91,76,245,0.08)" }}>
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Врач</label>
            <select
              value={filterDoctor}
              onChange={(e) => setFilterDoctor(e.target.value)}
              className="rounded-xl px-3 py-[7px] text-[12px] font-medium text-text-main outline-none cursor-pointer w-full"
              style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}
            >
              <option value="">Все врачи</option>
              {allDoctors.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-1">Статус</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl px-3 py-[7px] text-[12px] font-medium text-text-main outline-none cursor-pointer w-full"
              style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}
            >
              <option value="">Все статусы</option>
              {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div className="text-[11px] text-text-muted">
            Визиты: <span className="font-bold text-text-main">{appointments.length}</span>
          </div>
        </div>

        {/* Timetable */}
        <div
          className="flex-1 min-w-0 rounded-[16px] overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.65)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 18px rgba(120,140,180,0.18)",
          }}
        >
          {/* Date header */}
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
            <button onClick={() => setSelectedDate((d) => subDays(d, 1))} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[rgba(91,76,245,0.08)] border-none cursor-pointer bg-transparent text-text-muted">
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-[16px] font-extrabold capitalize">
              {format(selectedDate, "d MMMM yyyy, EEEE", { locale: ru })}
            </h2>
            <button onClick={() => setSelectedDate((d) => addDays(d, 1))} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[rgba(91,76,245,0.08)] border-none cursor-pointer bg-transparent text-text-muted">
              <ChevronRight size={16} />
            </button>
          </div>

          {isLoading ? (
            <div className="text-center text-text-muted py-20 text-[13px]">Загрузка данных...</div>
          ) : doctorsWithAppointments.length === 0 ? (
            <div className="text-center text-text-muted py-20 text-[13px]">Нет записей на выбранную дату</div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(doctorsWithAppointments.length * 180 + 60, 600) }}>
                {/* Doctor headers */}
                <div className="flex" style={{ borderBottom: "1px solid rgba(91,76,245,0.1)" }}>
                  <div className="w-[60px] flex-shrink-0" />
                  {doctorsWithAppointments.map(([doctorName, appts]) => (
                    <div
                      key={doctorName}
                      className="flex-1 min-w-[180px] text-center py-3 px-2"
                      style={{ borderLeft: "1px solid rgba(91,76,245,0.08)" }}
                    >
                      <div className="text-[13px] font-bold text-text-main truncate">{doctorName}</div>
                      <div className="text-[10px] text-text-muted mt-[2px]">{appts.length} записей</div>
                    </div>
                  ))}
                </div>

                {/* Time grid */}
                <div className="flex relative">
                  {/* Time column */}
                  <div className="w-[60px] flex-shrink-0">
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="text-[11px] text-text-muted text-right pr-2 font-mono"
                        style={{ height: SLOT_HEIGHT, lineHeight: `${SLOT_HEIGHT}px` }}
                      >
                        {String(h).padStart(2, "0")}:00
                      </div>
                    ))}
                  </div>

                  {/* Doctor columns */}
                  {doctorsWithAppointments.map(([doctorName, doctorAppts]) => (
                    <div
                      key={doctorName}
                      className="flex-1 min-w-[180px] relative"
                      style={{ height: gridHeight, borderLeft: "1px solid rgba(91,76,245,0.08)" }}
                    >
                      {/* Hour lines */}
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          className="absolute left-0 right-0"
                          style={{
                            top: (h - CLINIC_START) * SLOT_HEIGHT,
                            height: SLOT_HEIGHT,
                            borderBottom: "1px solid rgba(91,76,245,0.05)",
                          }}
                        />
                      ))}
                      {/* Half-hour lines */}
                      {HOURS.map((h) => (
                        <div
                          key={`${h}-half`}
                          className="absolute left-0 right-0"
                          style={{
                            top: (h - CLINIC_START) * SLOT_HEIGHT + SLOT_HEIGHT / 2,
                            borderBottom: "1px dashed rgba(91,76,245,0.03)",
                          }}
                        />
                      ))}
                      {/* Appointments */}
                      {doctorAppts.map((appt) => (
                        <AppointmentBlock
                          key={appt.id}
                          appt={appt}
                          onClick={() => setSelectedAppointmentId(appt.id)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddAppointmentModal onClose={() => setShowAddModal(false)} />
      )}

      {selectedAppointmentId && (
        <AppointmentDetailModal
          appointmentId={selectedAppointmentId}
          onClose={() => setSelectedAppointmentId(null)}
        />
      )}
    </div>
  );
}
