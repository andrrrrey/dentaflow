import { useState, useMemo } from "react";
import { format, parseISO, addDays, subDays, startOfMonth, endOfMonth, startOfWeek, addMonths, subMonths, isSameDay, isSameMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Sparkles } from "lucide-react";
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
const SLOT_HEIGHT = 110;

interface AppointmentLayout { appt: Appointment; col: number; totalCols: number; }

function computeLayout(appts: Appointment[]): AppointmentLayout[] {
  const filtered = appts.filter((a) => a.scheduled_at);
  if (filtered.length === 0) return [];
  const items = filtered.map((a) => {
    const start = parseISO(a.scheduled_at!);
    const startMin = start.getHours() * 60 + start.getMinutes();
    return { appt: a, startMin, endMin: startMin + a.duration_min };
  }).sort((a, b) => a.startMin - b.startMin);
  const colEnds: number[] = [];
  const assigned: { appt: Appointment; col: number }[] = [];
  for (const item of items) {
    const col = colEnds.findIndex((end) => end <= item.startMin);
    if (col === -1) { assigned.push({ appt: item.appt, col: colEnds.length }); colEnds.push(item.endMin); }
    else { assigned.push({ appt: item.appt, col }); colEnds[col] = item.endMin; }
  }
  return assigned.map(({ appt, col }) => ({ appt, col, totalCols: colEnds.length }));
}

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

function AppointmentBlock({ appt, onClick, col, totalCols }: { appt: Appointment; onClick: () => void; col: number; totalCols: number; }) {
  if (!appt.scheduled_at) return null;
  const start = parseISO(appt.scheduled_at);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const clinicStartMin = CLINIC_START * 60;
  const top = ((startMin - clinicStartMin) / 60) * SLOT_HEIGHT;
  const height = Math.max((appt.duration_min / 60) * SLOT_HEIGHT - 3, 32);
  const colors = statusColors[appt.status ?? ""] ?? statusColors.unconfirmed;
  const GAP = 2;
  const colW = 100 / totalCols;

  return (
    <div
      className="absolute rounded-[8px] cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${col * colW}% + ${GAP}px)`,
        width: `calc(${colW}% - ${GAP * 2}px)`,
        background: colors.bg,
        borderLeft: `3px solid ${colors.border}`,
        zIndex: 10,
      }}
      onClick={onClick}
    >
      <div className="px-2 py-[6px] h-full flex flex-col justify-start overflow-hidden">
        <div className="text-[10.5px] font-mono font-semibold leading-tight" style={{ color: colors.text }}>
          {format(start, "HH:mm")} – {format(new Date(start.getTime() + appt.duration_min * 60000), "HH:mm")}
        </div>
        <div className="text-[12.5px] font-bold text-text-main leading-tight mt-[3px]" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {appt.patient_name}
        </div>
        {height > 60 && appt.patient_phone && (
          <div className="text-[11px] text-text-muted truncate mt-[2px]">{appt.patient_phone}</div>
        )}
        {height > 80 && appt.service && (
          <div className="text-[11px] text-text-muted truncate mt-[2px]">{appt.service}</div>
        )}
      </div>
    </div>
  );
}

function AiScheduleBanner({ appointments, selectedDate }: { appointments: Appointment[]; selectedDate: Date }) {
  const doctorMap = new Map<string, number>();
  for (const a of appointments) {
    const doc = a.doctor_name || "Без врача";
    doctorMap.set(doc, (doctorMap.get(doc) ?? 0) + 1);
  }

  const total = appointments.length;
  const arrived = appointments.filter((a) => a.status === "arrived").length;
  const completed = appointments.filter((a) => a.status === "completed").length;
  const cancelled = appointments.filter((a) => a.status === "cancelled").length;
  const noShow = appointments.filter((a) => a.status === "no_show").length;
  const confirmed = appointments.filter((a) => a.status === "confirmed").length;
  const unconfirmed = appointments.filter((a) => a.status === "unconfirmed").length;

  const totalRevenue = appointments.reduce((s, a) => s + (a.revenue ?? 0), 0);
  const avgCheck = (arrived + completed) > 0 ? Math.round(totalRevenue / (arrived + completed)) : 0;

  const sortedDoctors = Array.from(doctorMap.entries()).sort((a, b) => b[1] - a[1]);
  const busiest = sortedDoctors[0];
  const freest = sortedDoctors[sortedDoctors.length - 1];

  const noShowRate = total > 0 ? Math.round((noShow / total) * 100) : 0;
  const confirmRate = total > 0 ? Math.round(((confirmed + arrived + completed) / total) * 100) : 0;

  // Build time-slot utilization (count per hour)
  const hourCounts = new Map<number, number>();
  for (const a of appointments) {
    if (a.scheduled_at) {
      const h = new Date(a.scheduled_at).getHours();
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    }
  }
  const peakHour = Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const quietSlots = HOURS.filter((h) => !hourCounts.has(h) || (hourCounts.get(h) ?? 0) === 0);

  const insights: { emoji: string; text: string }[] = [];

  // 1. Unconfirmed patients — action needed
  if (unconfirmed > 0) {
    insights.push({ emoji: "📞", text: `${unconfirmed} ${unconfirmed === 1 ? "пациент не подтверждён" : "пациентов не подтверждено"} — обзвоните до начала приёма` });
  }

  // 2. No-shows alert
  if (noShow > 0) {
    insights.push({ emoji: "⚠️", text: `${noShow} неявк${noShow === 1 ? "а" : (noShow < 5 ? "и" : "")} сегодня (${noShowRate}%) — свяжитесь, предложите перезапись` });
  }

  // 3. Cancellations
  if (cancelled > 0) {
    insights.push({ emoji: "🔄", text: `${cancelled} отмен${cancelled === 1 ? "а" : "ений"} — образовались окна, предложите ожидающим пациентам` });
  }

  // 4. Doctor workload imbalance
  if (busiest && freest && busiest[0] !== freest[0] && sortedDoctors.length >= 2 && busiest[1] >= freest[1] * 2) {
    insights.push({ emoji: "⚖️", text: `Д-р ${busiest[0].split(" ")[0]} перегружен (${busiest[1]} зап.) — направляйте первичных к д-ру ${freest[0].split(" ")[0]} (${freest[1]} зап.)` });
  }

  // 5. Revenue & avg check
  if (totalRevenue > 0) {
    const revenueStr = totalRevenue >= 1_000_000
      ? `${(totalRevenue / 1_000_000).toFixed(1)} млн ₽`
      : `${Math.round(totalRevenue / 1000)} тыс ₽`;
    insights.push({ emoji: "💰", text: `Выручка дня: ${revenueStr}${avgCheck > 0 ? `, средний чек ${avgCheck.toLocaleString("ru-RU")} ₽` : ""}` });
  }

  // 6. Confirmation rate
  if (total > 0 && confirmRate < 60 && confirmed + arrived + completed > 0) {
    insights.push({ emoji: "✅", text: `Подтверждено ${confirmRate}% из записей — запустите автоуведомления для остальных` });
  }

  // 7. Peak hour & free slots
  if (peakHour && peakHour[1] >= 3) {
    insights.push({ emoji: "🕐", text: `Пиковая загрузка в ${peakHour[0]}:00 (${peakHour[1]} записей)${quietSlots.length > 0 ? ` — есть свободные слоты в ${quietSlots.slice(0, 2).map((h) => `${h}:00`).join(", ")}` : ""}` });
  }

  // 8. All good fallback
  if (insights.length === 0 && total > 0) {
    insights.push({ emoji: "✨", text: `${total} записей, расписание сбалансировано — хороший рабочий день` });
  }
  if (total === 0) {
    insights.push({ emoji: "📅", text: `Нет записей на ${format(selectedDate, "d MMMM", { locale: ru })} — хорошее время для плановых задач и обзвона` });
  }

  return (
    <div
      className="rounded-[18px] p-[20px_24px] relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #6c5ce7 0%, #3b7fed 60%, #00c9a7 100%)",
        boxShadow: "0 4px 24px rgba(91,76,245,0.22)",
      }}
    >
      <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }} />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={15} className="text-white" />
          <span className="text-[11px] font-bold tracking-wider text-white/80 uppercase">ИИ-Ассистент · Расписание</span>
          <span className="ml-2 text-[11px] text-white/60 capitalize">{format(selectedDate, "d MMMM", { locale: ru })}</span>
          {total > 0 && (
            <span className="ml-auto text-[11px] text-white/70 font-semibold">{total} записей · {confirmed + arrived + completed} активных</span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[8px]">
          {insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[15px] leading-tight flex-shrink-0">{ins.emoji}</span>
              <span className="text-[13px] text-white font-medium leading-snug" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.2)" }}>{ins.text}</span>
            </div>
          ))}
        </div>
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
      {/* AI banner — top of page */}
      {!isLoading && appointments.length > 0 && (
        <AiScheduleBanner appointments={appointments} selectedDate={selectedDate} />
      )}

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
              <div style={{ minWidth: Math.max(doctorsWithAppointments.length * 220 + 60, 600) }}>
                {/* Doctor headers */}
                <div className="flex" style={{ borderBottom: "1px solid rgba(91,76,245,0.1)" }}>
                  <div className="w-[60px] flex-shrink-0" />
                  {doctorsWithAppointments.map(([doctorName, appts]) => (
                    <div
                      key={doctorName}
                      className="flex-1 min-w-[220px] text-center py-3 px-2"
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
                      className="flex-1 min-w-[220px] relative"
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
                      {/* Appointments with overlap-aware layout */}
                      {computeLayout(doctorAppts).map(({ appt, col, totalCols }) => (
                        <AppointmentBlock
                          key={appt.id}
                          appt={appt}
                          col={col}
                          totalCols={totalCols}
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
