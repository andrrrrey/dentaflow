import { useMemo, useState } from "react";
import { Pencil, Check, X, CalendarClock, Trash2, Stethoscope, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, parseISO, startOfMonth, endOfMonth, startOfWeek, isSameMonth } from "date-fns";
import { ru } from "date-fns/locale";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Pill from "../ui/Pill";
import { useUpdateResourceName } from "../../api/directories";
import {
  useDoctorProfiles,
  useUpdateDoctorProfile,
  type DoctorProfile,
  type DayHours,
  type ScheduleException,
} from "../../api/doctorProfiles";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(91,76,245,0.15)",
  background: "rgba(255,255,255,0.5)",
};

function formatBirthDate(v?: string | null): string {
  if (!v) return "—";
  const [y, m, d] = v.split("-");
  return d && m && y ? `${d}.${m}.${y}` : v;
}

function scheduleSummary(d: DoctorProfile): string {
  const days = Object.keys(d.weekly_hours || {}).filter(
    (k) => d.weekly_hours[k]?.start && d.weekly_hours[k]?.end,
  );
  if (days.length === 0) return "Не задан";
  const labels = days
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((i) => WEEKDAYS[i])
    .join(", ");
  return labels;
}

/* ---------- schedule modal ---------- */

interface DayState extends DayHours {
  enabled: boolean;
}

/** Переопределение графика на конкретную дату (ячейка календаря). */
type DayOverride = {
  off?: boolean;
  start?: string;
  end?: string;
  break_start?: string | null;
  break_end?: string | null;
};

interface EffectiveDay extends DayOverride {
  off: boolean;
  source: "override" | "template" | "unset";
}

/** День недели (Пн=0..Вс=6) для строки даты "YYYY-MM-DD". */
function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

function nextDay(dateStr: string): string {
  return format(addDays(parseISO(dateStr), 1), "yyyy-MM-dd");
}

function DoctorScheduleModal({ doctor, onClose }: { doctor: DoctorProfile; onClose: () => void }) {
  const updateProfile = useUpdateDoctorProfile();

  const [birthDate, setBirthDate] = useState(doctor.birth_date ?? "");
  const [days, setDays] = useState<DayState[]>(() =>
    Array.from({ length: 7 }, (_, i) => {
      const cfg = doctor.weekly_hours?.[String(i)];
      return {
        enabled: Boolean(cfg?.start && cfg?.end),
        start: cfg?.start ?? "09:00",
        end: cfg?.end ?? "18:00",
        break_start: cfg?.break_start ?? "",
        break_end: cfg?.break_end ?? "",
      };
    }),
  );
  // Переопределения по конкретным датам (календарь). Ключ — "YYYY-MM-DD".
  const [overrides, setOverrides] = useState<Record<string, DayOverride>>(() => {
    const map: Record<string, DayOverride> = {};
    for (const ex of doctor.schedule_exceptions ?? []) {
      if (!ex?.date) continue;
      map[ex.date] = ex.off
        ? { off: true }
        : {
            start: ex.start,
            end: ex.end,
            break_start: ex.break_start ?? null,
            break_end: ex.break_end ?? null,
          };
    }
    return map;
  });
  const [showTemplate, setShowTemplate] = useState(false);
  const [calMonth, setCalMonth] = useState<Date>(new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");

  // --- Быстрое заполнение ---
  const [qfFrom, setQfFrom] = useState("");
  const [qfTo, setQfTo] = useState("");
  const [repEvery, setRepEvery] = useState(2);
  const [repUntil, setRepUntil] = useState("");

  function patchDay(i: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  /** Недельный шаблон для дня недели (null → по шаблону выходной). */
  function templateFor(weekday: number): DayOverride | null {
    const d = days[weekday];
    if (!d?.enabled || !d.start || !d.end) return null;
    return { start: d.start, end: d.end, break_start: d.break_start || null, break_end: d.break_end || null };
  }

  /** Итоговый график даты: переопределение → недельный шаблон → не задан. */
  function effective(dateStr: string): EffectiveDay {
    const o = overrides[dateStr];
    if (o) {
      return o.off
        ? { off: true, source: "override" }
        : { off: false, source: "override", start: o.start, end: o.end, break_start: o.break_start, break_end: o.break_end };
    }
    const t = templateFor(weekdayOf(dateStr));
    if (t) return { off: false, source: "template", ...t };
    return { off: true, source: "unset" };
  }

  function setOverride(dateStr: string, ov: DayOverride | null) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (ov === null) delete next[dateStr];
      else next[dateStr] = ov;
      return next;
    });
  }

  function validRange(): boolean {
    if (!qfFrom || !qfTo || qfFrom > qfTo) {
      setError("Укажите корректный диапазон дат (с ≤ по)");
      return false;
    }
    setError("");
    return true;
  }

  /** Материализовать недельный шаблон в каждую дату диапазона. */
  function applyTemplateToRange() {
    if (!validRange()) return;
    setOverrides((prev) => {
      const next = { ...prev };
      for (let cur = qfFrom; cur <= qfTo; cur = nextDay(cur)) {
        const t = templateFor(weekdayOf(cur));
        next[cur] = t ? { ...t } : { off: true };
      }
      return next;
    });
  }

  /** Отметить весь диапазон выходными. */
  function markRangeOff() {
    if (!validRange()) return;
    setOverrides((prev) => {
      const next = { ...prev };
      for (let cur = qfFrom; cur <= qfTo; cur = nextDay(cur)) next[cur] = { off: true };
      return next;
    });
  }

  /** Сбросить переопределения диапазона (вернуть к недельному шаблону). */
  function clearRange() {
    if (!validRange()) return;
    setOverrides((prev) => {
      const next = { ...prev };
      for (let cur = qfFrom; cur <= qfTo; cur = nextDay(cur)) delete next[cur];
      return next;
    });
  }

  /**
   * Повторить расписание диапазона каждые N недель до даты repUntil.
   * Так делаются любые чередующиеся графики: настраиваете, например, две
   * недели вторников (14:00 и 15:00) и повторяете блок каждые 2 недели.
   */
  function repeatRange() {
    if (!validRange()) return;
    if (!repUntil || repUntil <= qfTo) {
      setError("Укажите дату «до» — позже конца диапазона");
      return;
    }
    if (repEvery < 1) {
      setError("Период повтора — минимум 1 неделя");
      return;
    }
    const srcDates: string[] = [];
    for (let cur = qfFrom; cur <= qfTo; cur = nextDay(cur)) srcDates.push(cur);
    const shift = repEvery * 7;
    setOverrides((prev) => {
      const next = { ...prev };
      for (let k = 1; k < 520; k++) {
        const offset = k * shift;
        if (format(addDays(parseISO(qfFrom), offset), "yyyy-MM-dd") > repUntil) break;
        for (const sd of srcDates) {
          const td = format(addDays(parseISO(sd), offset), "yyyy-MM-dd");
          if (td > repUntil) continue;
          const eff = effective(sd);
          next[td] = eff.off
            ? { off: true }
            : { start: eff.start, end: eff.end, break_start: eff.break_start ?? null, break_end: eff.break_end ?? null };
        }
      }
      return next;
    });
  }

  async function handleSave() {
    setError("");
    const weekly: Record<string, DayHours> = {};
    for (let i = 0; i < 7; i++) {
      const d = days[i];
      if (!d.enabled) continue;
      if (!d.start || !d.end || d.start >= d.end) {
        setError(`${WEEKDAYS[i]}: некорректный интервал (начало должно быть раньше конца)`);
        return;
      }
      weekly[String(i)] = {
        start: d.start,
        end: d.end,
        break_start: d.break_start || null,
        break_end: d.break_end || null,
      };
    }
    const exceptions: ScheduleException[] = [];
    for (const [date, o] of Object.entries(overrides)) {
      if (o.off) {
        exceptions.push({ date, off: true });
      } else if (o.start && o.end && o.start < o.end) {
        exceptions.push({
          date,
          start: o.start,
          end: o.end,
          break_start: o.break_start || null,
          break_end: o.break_end || null,
        });
      }
    }
    exceptions.sort((a, b) => a.date.localeCompare(b.date));
    try {
      await updateProfile.mutateAsync({
        doctorId: doctor.doctor_id,
        birth_date: birthDate || null,
        weekly_hours: weekly,
        schedule_exceptions: exceptions,
      });
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Ошибка при сохранении");
    }
  }

  // Сетка календаря выбранного месяца (недели с понедельника).
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridDays: Date[] = [];
  for (let dd = calStart; dd <= monthEnd || gridDays.length % 7 !== 0; dd = addDays(dd, 1)) {
    gridDays.push(dd);
  }
  const selEff = selected ? effective(selected) : null;
  const selMode: "template" | "work" | "off" = selected
    ? overrides[selected]
      ? overrides[selected]!.off
        ? "off"
        : "work"
      : "template"
    : "template";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[680px] mx-4 rounded-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        style={{
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 20px 60px rgba(91,76,245,0.18)",
          border: "1px solid rgba(255,255,255,0.9)",
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">График работы — {doctor.name}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main border-none bg-transparent cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Дата рождения</label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none w-[180px]"
            style={inputStyle}
          />
        </div>

        {/* --- Недельный шаблон (по умолчанию) — сворачиваемый --- */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowTemplate((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted uppercase tracking-wider border-none bg-transparent cursor-pointer p-0 self-start"
          >
            {showTemplate ? <ChevronRight size={13} className="rotate-90 transition-transform" /> : <ChevronRight size={13} className="transition-transform" />}
            Шаблон недели (по умолчанию)
          </button>
          {showTemplate && (
            <div className="flex flex-col gap-1.5 pl-1">
              <p className="text-[11px] text-text-muted mb-1">
                Применяется к датам без индивидуальной настройки и используется как источник для быстрого заполнения.
              </p>
              {days.map((d, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 w-[64px] cursor-pointer select-none">
                    <input type="checkbox" checked={d.enabled} onChange={(e) => patchDay(i, { enabled: e.target.checked })} className="cursor-pointer" />
                    <span className="text-[12.5px] font-semibold">{WEEKDAYS[i]}</span>
                  </label>
                  {d.enabled ? (
                    <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-text-muted">
                      <input type="time" value={d.start} onChange={(e) => patchDay(i, { start: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                      <span>–</span>
                      <input type="time" value={d.end} onChange={(e) => patchDay(i, { end: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                      <span className="ml-1">перерыв</span>
                      <input type="time" value={d.break_start ?? ""} onChange={(e) => patchDay(i, { break_start: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                      <span>–</span>
                      <input type="time" value={d.break_end ?? ""} onChange={(e) => patchDay(i, { break_end: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                    </div>
                  ) : (
                    <span className="text-[12px] text-text-muted">Выходной</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- Календарь по датам --- */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">График по датам</label>
          <div className="flex items-center justify-between">
            <button onClick={() => setCalMonth((m) => startOfMonth(addDays(startOfMonth(m), -1)))} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[rgba(91,76,245,0.08)] border-none cursor-pointer bg-transparent text-text-muted">
              <ChevronLeft size={15} />
            </button>
            <span className="text-[13px] font-bold capitalize">{format(calMonth, "LLLL yyyy", { locale: ru })}</span>
            <button onClick={() => setCalMonth((m) => startOfMonth(addDays(endOfMonth(m), 1)))} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[rgba(91,76,245,0.08)] border-none cursor-pointer bg-transparent text-text-muted">
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="text-[10px] font-bold text-text-muted text-center">{wd}</div>
            ))}
            {gridDays.map((day) => {
              const ds = format(day, "yyyy-MM-dd");
              const eff = effective(ds);
              const inMonth = isSameMonth(day, calMonth);
              const isSel = ds === selected;
              const isOverride = eff.source === "override";
              const bg = eff.off
                ? isOverride
                  ? "rgba(244,75,110,0.12)"
                  : "transparent"
                : isOverride
                  ? "rgba(91,76,245,0.14)"
                  : "rgba(16,185,129,0.09)";
              const label = eff.off ? (isOverride ? "Вых" : "—") : eff.start ?? "";
              return (
                <button
                  key={ds}
                  onClick={() => setSelected(ds)}
                  className="rounded-lg px-1 py-1 flex flex-col items-center justify-start border cursor-pointer transition-all min-h-[42px]"
                  style={{
                    background: bg,
                    borderColor: isSel ? "#5B4CF5" : "rgba(91,76,245,0.10)",
                    borderWidth: isSel ? 2 : 1,
                    opacity: inMonth ? 1 : 0.4,
                  }}
                >
                  <span className="text-[12px] font-semibold leading-none text-text-main">{format(day, "d")}</span>
                  <span className="text-[9.5px] tabular-nums leading-tight mt-[2px] text-text-muted">{label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10.5px] text-text-muted">
            <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded" style={{ background: "rgba(91,76,245,0.14)" }} /> своё время</span>
            <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded" style={{ background: "rgba(16,185,129,0.09)" }} /> по шаблону</span>
            <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded" style={{ background: "rgba(244,75,110,0.12)" }} /> выходной</span>
          </div>

          {/* Редактор выбранного дня */}
          {selected && selEff && (
            <div className="rounded-xl p-3 flex flex-col gap-2" style={{ border: "1px solid rgba(91,76,245,0.15)", background: "rgba(91,76,245,0.03)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-bold">{formatBirthDate(selected)} · {WEEKDAYS[weekdayOf(selected)]}</span>
                <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text-main border-none bg-transparent cursor-pointer"><X size={15} /></button>
              </div>
              <div className="flex items-center gap-3 flex-wrap text-[12px]">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="radio" name="daymode" checked={selMode === "template"} onChange={() => setOverride(selected, null)} className="cursor-pointer" />
                  <span>По шаблону</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="daymode"
                    checked={selMode === "work"}
                    onChange={() => setOverride(selected, {
                      start: selEff.start ?? "09:00",
                      end: selEff.end ?? "18:00",
                      break_start: selEff.break_start ?? "",
                      break_end: selEff.break_end ?? "",
                    })}
                    className="cursor-pointer"
                  />
                  <span>Рабочий</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="radio" name="daymode" checked={selMode === "off"} onChange={() => setOverride(selected, { off: true })} className="cursor-pointer" />
                  <span>Выходной</span>
                </label>
              </div>
              {selMode === "work" && (
                <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-text-muted">
                  <input type="time" value={overrides[selected]?.start ?? "09:00"} onChange={(e) => setOverride(selected, { ...overrides[selected], start: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                  <span>–</span>
                  <input type="time" value={overrides[selected]?.end ?? "18:00"} onChange={(e) => setOverride(selected, { ...overrides[selected], end: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                  <span className="ml-1">перерыв</span>
                  <input type="time" value={overrides[selected]?.break_start ?? ""} onChange={(e) => setOverride(selected, { ...overrides[selected], break_start: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                  <span>–</span>
                  <input type="time" value={overrides[selected]?.break_end ?? ""} onChange={(e) => setOverride(selected, { ...overrides[selected], break_end: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* --- Быстрое заполнение --- */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Быстрое заполнение</label>
          <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-text-muted">
            <span>с</span>
            <input type="date" value={qfFrom} onChange={(e) => setQfFrom(e.target.value)} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
            <span>по</span>
            <input type="date" value={qfTo} onChange={(e) => setQfTo(e.target.value)} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={applyTemplateToRange}>Заполнить по шаблону</Button>
            <Button variant="ghost" size="sm" onClick={markRangeOff}>Сделать выходными</Button>
            <Button variant="ghost" size="sm" onClick={clearRange}>
              <Trash2 size={13} className="mr-1" /> Очистить диапазон
            </Button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-text-muted">
            <span>Повторять этот диапазон каждые</span>
            <input type="number" min={1} max={12} value={repEvery} onChange={(e) => setRepEvery(Math.max(1, Number(e.target.value) || 1))} className="w-[52px] px-2 py-1 rounded-lg outline-none" style={inputStyle} />
            <span>нед. до</span>
            <input type="date" value={repUntil} onChange={(e) => setRepUntil(e.target.value)} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
            <Button variant="primary" size="sm" onClick={repeatRange}>Повторить</Button>
          </div>
          <p className="text-[11px] text-text-muted">
            Чтобы сделать чередование (например, вторник то с 14:00, то с 15:00): настройте два вторника подряд в календаре, задайте этот диапазон здесь и повторите его каждые 2 недели.
          </p>
        </div>

        {error && (
          <div className="text-[12px] text-[#F44B6E] px-3 py-2 rounded-xl bg-[rgba(244,75,110,0.08)] border border-[rgba(244,75,110,0.2)]">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Отмена</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- inline name editing ---------- */

function DoctorRow({ doctor, onSchedule }: { doctor: DoctorProfile; onSchedule: (d: DoctorProfile) => void }) {
  const rename = useUpdateResourceName();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(doctor.name);

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== doctor.name) {
      await rename.mutateAsync({ externalId: doctor.doctor_id, name: trimmed });
    }
    setEditing(false);
  }

  return (
    <tr className="hover:bg-[rgba(91,76,245,0.03)]" style={{ borderBottom: "1px solid rgba(91,76,245,0.05)" }}>
      <td className="py-[10px] px-[12px]">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="px-2 py-1 rounded-lg text-[13px] outline-none"
              style={inputStyle}
            />
            <button onClick={saveName} className="w-6 h-6 rounded-lg flex items-center justify-center text-accent3 border-none bg-transparent cursor-pointer" title="Сохранить">
              <Check size={14} />
            </button>
            <button onClick={() => { setNameDraft(doctor.name); setEditing(false); }} className="w-6 h-6 rounded-lg flex items-center justify-center text-text-muted border-none bg-transparent cursor-pointer" title="Отмена">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#00C9A7,#3B7FED)" }}>
              <Stethoscope size={15} />
            </div>
            <span className="text-[13px] font-semibold">{doctor.name}</span>
            <button onClick={() => setEditing(true)} className="w-6 h-6 rounded-lg flex items-center justify-center text-text-muted hover:text-accent2 border-none bg-transparent cursor-pointer" title="Переименовать">
              <Pencil size={12} />
            </button>
          </div>
        )}
      </td>
      <td className="py-[10px] px-[12px] text-[12.5px] text-text-muted">{doctor.description || "—"}</td>
      <td className="py-[10px] px-[12px] text-[12.5px] text-text-muted">{formatBirthDate(doctor.birth_date)}</td>
      <td className="py-[10px] px-[12px]">
        <Pill variant={scheduleSummary(doctor) === "Не задан" ? "gray" : "green"}>{scheduleSummary(doctor)}</Pill>
      </td>
      <td className="py-[10px] px-[12px]">
        <Button variant="ghost" size="sm" onClick={() => onSchedule(doctor)}>
          <CalendarClock size={13} className="mr-1" />
          График
        </Button>
      </td>
    </tr>
  );
}

/* ---------- section ---------- */

export default function DoctorsSection() {
  const { data, isLoading } = useDoctorProfiles();
  const [scheduleDoctor, setScheduleDoctor] = useState<DoctorProfile | null>(null);

  const doctors = useMemo(() => data?.doctors ?? [], [data]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-bold">Врачи</h2>
        <span className="text-[11.5px] text-text-muted">Из справочника 1Denta — редактирование имени и графика работы</span>
      </div>

      {isLoading ? (
        <div className="text-center text-text-muted py-10 text-[13px]">Загрузка данных...</div>
      ) : doctors.length === 0 ? (
        <div className="text-center text-text-muted py-10 text-[13px]">Нет врачей</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Врач", "Специализация", "Дата рождения", "График", "Действия"].map((h) => (
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
              {doctors.map((d) => (
                <DoctorRow key={d.doctor_id} doctor={d} onSchedule={setScheduleDoctor} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scheduleDoctor && (
        <DoctorScheduleModal doctor={scheduleDoctor} onClose={() => setScheduleDoctor(null)} />
      )}
    </Card>
  );
}
