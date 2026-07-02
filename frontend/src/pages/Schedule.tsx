import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { format, parseISO, addDays, subDays, startOfMonth, endOfMonth, startOfWeek, addMonths, subMonths, isSameDay, isSameMonth, differenceInYears } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import StatCard from "../components/ui/StatCard";
import Button from "../components/ui/Button";
import { useSchedule, useDoctorsList, useUpdateAppointment } from "../api/schedule";
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
const SLOT_HEIGHT = 150;
const MIN_COL_W = 150;
const TIME_COL_W = 64;
const SNAP_MIN = 15;
const CLINIC_START_MIN = CLINIC_START * 60;
const CLINIC_END_MIN = CLINIC_END * 60;

function calcAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  try {
    return differenceInYears(new Date(), new Date(birthDate));
  } catch {
    return null;
  }
}

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

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface DragPreview {
  apptId: string;
  newStartMin: number;
  targetDoctor: string;
  origDoctor: string;
  dxPx: number;
  dyPx: number;
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

function AppointmentBlock({ appt, onClick, col, totalCols, colWidth, onDragStart, preview }: {
  appt: Appointment;
  onClick: () => void;
  col: number;
  totalCols: number;
  colWidth: number;
  onDragStart: (appt: Appointment, e: React.MouseEvent) => void;
  preview: DragPreview | null;
}) {
  if (!appt.scheduled_at) return null;
  const start = parseISO(appt.scheduled_at);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const top = ((startMin - CLINIC_START_MIN) / 60) * SLOT_HEIGHT;
  const height = Math.max((appt.duration_min / 60) * SLOT_HEIGHT - 3, 32);
  const colors = statusColors[appt.status ?? ""] ?? statusColors.unconfirmed;
  const GAP = 3;
  const colW = 100 / totalCols;
  const compact = totalCols > 1 || colWidth < 200;
  const age = calcAge(appt.patient_birth_date);

  const isDragging = preview != null;
  const displayStartMin = isDragging ? preview.newStartMin : startMin;
  const displayEndMin = displayStartMin + appt.duration_min;

  return (
    <div
      className="absolute rounded-[10px] cursor-grab active:cursor-grabbing overflow-hidden transition-shadow hover:shadow-lg hover:z-20"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${col * colW}% + ${GAP}px)`,
        width: `calc(${colW}% - ${GAP * 2}px)`,
        background: colors.bg,
        borderLeft: `4px solid ${colors.border}`,
        boxShadow: isDragging ? "0 8px 24px rgba(91,76,245,0.35)" : "0 1px 4px rgba(120,140,180,0.12)",
        zIndex: isDragging ? 60 : 10,
        transform: isDragging ? `translate(${preview.dxPx}px, ${preview.dyPx}px)` : undefined,
        opacity: isDragging ? 0.92 : 1,
        pointerEvents: isDragging ? "none" : undefined,
      }}
      onMouseDown={(e) => onDragStart(appt, e)}
      onClick={onClick}
    >
      <div className="px-[9px] py-[7px] h-full flex flex-col justify-start overflow-hidden">
        <div className="text-[11.5px] font-mono font-semibold leading-tight" style={{ color: colors.text }}>
          {fmtMin(displayStartMin)} – {fmtMin(displayEndMin)}
        </div>
        <div className="text-[13.5px] font-bold text-text-main leading-snug mt-[3px]" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {appt.patient_name}
          {age !== null && <span className="font-medium text-text-muted">, {age} лет</span>}
        </div>
        {height > 56 && appt.patient_phone && (
          <div className="text-[12px] text-text-muted truncate mt-[3px] font-medium">{appt.patient_phone}</div>
        )}
        {height > 84 && appt.service && (
          <div
            className="text-[11.5px] text-text-muted mt-[3px] leading-snug"
            style={!compact ? { overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {appt.service}
          </div>
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
  const [calendarPanelOpen, setCalendarPanelOpen] = useState(true);
  const [containerW, setContainerW] = useState(0);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data, isLoading } = useSchedule({
    date_from: dateStr,
    date_to: dateStr,
    doctor: filterDoctor || undefined,
    status: filterStatus || undefined,
  });
  const { data: doctorsData } = useDoctorsList();
  const updateAppt = useUpdateAppointment();

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

  const specialtyByDoctor = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of doctorsData?.doctors ?? []) {
      if (d.doctor_name && d.specialty) map.set(d.doctor_name, d.specialty);
    }
    return map;
  }, [doctorsData]);

  const doctorIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of doctorsData?.doctors ?? []) {
      if (d.doctor_name && d.doctor_id) map.set(d.doctor_name, d.doctor_id);
    }
    return map;
  }, [doctorsData]);

  const gridHeight = HOURS.length * SLOT_HEIGHT;
  const doctorCount = doctorsWithAppointments.length;

  // Responsive column width: fit all doctors into the available width, only
  // falling back to horizontal scroll when even MIN_COL_W doesn't fit.
  const colWidth = useMemo(() => {
    if (doctorCount === 0 || containerW === 0) return MIN_COL_W;
    return Math.max(MIN_COL_W, Math.floor((containerW - TIME_COL_W) / doctorCount));
  }, [containerW, doctorCount]);
  const contentWidth = TIME_COL_W + colWidth * doctorCount;

  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading, calendarPanelOpen, doctorCount]);

  // --- Drag-to-reschedule ---
  const [drag, setDrag] = useState<{
    appt: Appointment;
    origDoctor: string;
    origStartMin: number;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
    moved: boolean;
  } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const computePreview = useCallback((d: NonNullable<typeof drag>): DragPreview | null => {
    const deltaY = d.curY - d.startY;
    const deltaMin = Math.round((deltaY / SLOT_HEIGHT) * 60 / SNAP_MIN) * SNAP_MIN;
    let newStartMin = d.origStartMin + deltaMin;
    newStartMin = Math.max(CLINIC_START_MIN, Math.min(CLINIC_END_MIN - d.appt.duration_min, newStartMin));

    let targetDoctor = d.origDoctor;
    let origIndex = doctorsWithAppointments.findIndex(([name]) => name === d.origDoctor);
    let targetIndex = origIndex;
    const row = columnsRowRef.current;
    if (row && doctorCount > 0) {
      const rect = row.getBoundingClientRect();
      const relX = d.curX - rect.left - TIME_COL_W;
      const idx = Math.floor(relX / colWidth);
      targetIndex = Math.max(0, Math.min(doctorCount - 1, idx));
      targetDoctor = doctorsWithAppointments[targetIndex]?.[0] ?? d.origDoctor;
    }
    if (origIndex < 0) origIndex = targetIndex;

    return {
      apptId: d.appt.id,
      newStartMin,
      targetDoctor,
      origDoctor: d.origDoctor,
      dxPx: (targetIndex - origIndex) * colWidth,
      dyPx: ((newStartMin - d.origStartMin) / 60) * SLOT_HEIGHT,
    };
  }, [doctorsWithAppointments, doctorCount, colWidth]);

  const preview = drag && drag.moved ? computePreview(drag) : null;

  const handleDragStart = useCallback((appt: Appointment, e: React.MouseEvent) => {
    if (e.button !== 0 || !appt.scheduled_at) return;
    // "Без врача" pseudo-column has no real doctor — still allow time moves
    const start = parseISO(appt.scheduled_at);
    const origStartMin = start.getHours() * 60 + start.getMinutes();
    setDrag({
      appt,
      origDoctor: appt.doctor_name || "Без врача",
      origStartMin,
      startX: e.clientX,
      startY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
      moved: false,
    });
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      setDrag((prev) => {
        if (!prev) return prev;
        const moved = prev.moved || Math.abs(e.clientX - prev.startX) > 4 || Math.abs(e.clientY - prev.startY) > 4;
        return { ...prev, curX: e.clientX, curY: e.clientY, moved };
      });
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d && d.moved) {
        const p = computePreview(d);
        if (p) {
          const changedTime = p.newStartMin !== d.origStartMin;
          const changedDoctor = p.targetDoctor !== d.origDoctor && p.targetDoctor !== "Без врача";
          if (changedTime || changedDoctor) {
            const scheduled_at = changedTime
              ? `${format(selectedDate, "yyyy-MM-dd")}T${fmtMin(p.newStartMin)}:00`
              : undefined;
            const doctorPatch = changedDoctor
              ? { doctor_name: p.targetDoctor, ...(doctorIdByName.get(p.targetDoctor) ? { doctor_id: doctorIdByName.get(p.targetDoctor) } : {}) }
              : {};
            updateAppt.mutate({
              appointmentId: d.appt.id,
              ...(scheduled_at ? { scheduled_at } : {}),
              ...doctorPatch,
            });
          }
        }
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag != null, computePreview, selectedDate, doctorIdByName, updateAppt]);

  // Suppress the click that fires right after a drag move
  const suppressClickRef = useRef(false);
  useEffect(() => {
    if (drag?.moved) suppressClickRef.current = true;
  }, [drag?.moved]);

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
      <div className="flex gap-4 items-start">
        {/* Collapsed: slim strip with expand button */}
        {!calendarPanelOpen && (
          <div
            className="w-12 flex-shrink-0 rounded-[16px] flex flex-col items-center pt-3 self-start sticky top-0"
            style={{
              background: "rgba(255,255,255,0.65)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 4px 18px rgba(120,140,180,0.18)",
            }}
          >
            <button
              onClick={() => setCalendarPanelOpen(true)}
              title="Развернуть календарь"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-accent2 hover:bg-[rgba(91,76,245,0.08)] border-none cursor-pointer bg-transparent"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        )}

        {/* Left sidebar: mini calendar + filters */}
        {calendarPanelOpen && (
        <div
          className="w-[240px] flex-shrink-0 rounded-[16px] p-4 flex flex-col gap-4 self-start sticky top-0 max-h-[calc(100vh-110px)] overflow-y-auto"
          style={{
            background: "rgba(255,255,255,0.65)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 18px rgba(120,140,180,0.18)",
          }}
        >
          <div className="flex items-center justify-between -mb-1">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Календарь</span>
            <button
              onClick={() => setCalendarPanelOpen(false)}
              title="Свернуть"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-accent2 hover:bg-[rgba(91,76,245,0.08)] border-none cursor-pointer bg-transparent"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

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
        )}

        {/* Timetable — sticky, fills the viewport once the stat cards scroll away */}
        <div
          className="flex-1 min-w-0 rounded-[16px] overflow-hidden flex flex-col self-start sticky top-0"
          style={{
            height: "calc(100vh - 110px)",
            background: "rgba(255,255,255,0.65)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 18px rgba(120,140,180,0.18)",
          }}
        >
          {/* Date header */}
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
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

          <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="text-center text-text-muted py-20 text-[13px]">Загрузка данных...</div>
          ) : doctorsWithAppointments.length === 0 ? (
            <div className="text-center text-text-muted py-20 text-[13px]">Нет записей на выбранную дату</div>
          ) : (
            <div ref={scrollRef} className="h-full overflow-auto">
              <div style={{ width: contentWidth }}>
                {/* Doctor headers */}
                <div className="flex sticky top-0 z-40" style={{ borderBottom: "1px solid rgba(91,76,245,0.1)", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }}>
                  <div
                    className="flex-shrink-0 sticky left-0 z-50"
                    style={{ width: TIME_COL_W, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }}
                  />
                  {doctorsWithAppointments.map(([doctorName, appts]) => {
                    const specialty = specialtyByDoctor.get(doctorName);
                    const initials = doctorName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
                    return (
                      <div
                        key={doctorName}
                        className="flex items-center gap-[9px] py-[11px] px-3"
                        style={{ width: colWidth, flex: "0 0 auto", borderLeft: "1px solid rgba(91,76,245,0.08)" }}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                          style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
                        >
                          {initials || "—"}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-bold text-text-main truncate leading-tight">{doctorName}</div>
                          <div className="text-[11px] text-text-muted truncate mt-[1px]">
                            {specialty ? `${specialty} · ` : ""}{appts.length} записей
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Time grid */}
                <div ref={columnsRowRef} className="flex relative">
                  {/* Time column — sticky on horizontal scroll */}
                  <div
                    className="flex-shrink-0 sticky left-0 z-30"
                    style={{ width: TIME_COL_W, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }}
                  >
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="text-[11.5px] text-text-muted text-right pr-2 font-mono"
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
                      className="relative"
                      style={{ width: colWidth, flex: "0 0 auto", height: gridHeight, borderLeft: "1px solid rgba(91,76,245,0.08)" }}
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
                          colWidth={colWidth}
                          onDragStart={handleDragStart}
                          preview={preview && preview.apptId === appt.id ? preview : null}
                          onClick={() => {
                            if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                            setSelectedAppointmentId(appt.id);
                          }}
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
      </div>

      {/* Drag tooltip — follows the cursor with the new time / doctor */}
      {drag && drag.moved && preview && (
        <div
          className="fixed z-[300] pointer-events-none rounded-lg px-3 py-[6px] text-[12px] font-bold text-white shadow-lg"
          style={{
            left: drag.curX + 14,
            top: drag.curY + 14,
            background: "linear-gradient(135deg, #5B4CF5, #3B7FED)",
          }}
        >
          {fmtMin(preview.newStartMin)} – {fmtMin(preview.newStartMin + drag.appt.duration_min)}
          {preview.targetDoctor !== preview.origDoctor && preview.targetDoctor !== "Без врача" && (
            <span className="font-medium opacity-90"> · {preview.targetDoctor}</span>
          )}
        </div>
      )}

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
