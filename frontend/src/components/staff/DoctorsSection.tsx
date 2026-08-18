import { useMemo, useState } from "react";
import { Pencil, Check, X, CalendarClock, Plus, Trash2, Stethoscope } from "lucide-react";
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
  const [exceptions, setExceptions] = useState<ScheduleException[]>(
    () => (doctor.schedule_exceptions ?? []).map((e) => ({ ...e })),
  );
  const [error, setError] = useState("");

  function patchDay(i: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function addException() {
    const today = new Date().toISOString().slice(0, 10);
    setExceptions((prev) => [...prev, { date: today, off: true }]);
  }

  function patchException(i: number, patch: Partial<ScheduleException>) {
    setExceptions((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[560px] mx-4 rounded-2xl p-6 flex flex-col gap-4 max-h-[88vh] overflow-y-auto"
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

        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Рабочие часы по дням недели</label>
          <div className="flex flex-col gap-1.5">
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
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Исключения по датам (отпуск / замена)</label>
            <button onClick={addException} className="text-[12px] text-accent2 flex items-center gap-1 border-none bg-transparent cursor-pointer">
              <Plus size={13} /> Добавить
            </button>
          </div>
          {exceptions.length === 0 ? (
            <span className="text-[12px] text-text-muted">Нет исключений</span>
          ) : (
            <div className="flex flex-col gap-1.5">
              {exceptions.map((ex, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap text-[12px] text-text-muted">
                  <input type="date" value={ex.date} onChange={(e) => patchException(i, { date: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={Boolean(ex.off)} onChange={(e) => patchException(i, { off: e.target.checked })} className="cursor-pointer" />
                    <span>Выходной</span>
                  </label>
                  {!ex.off && (
                    <>
                      <input type="time" value={ex.start ?? "09:00"} onChange={(e) => patchException(i, { start: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                      <span>–</span>
                      <input type="time" value={ex.end ?? "18:00"} onChange={(e) => patchException(i, { end: e.target.value })} className="px-2 py-1 rounded-lg outline-none" style={inputStyle} />
                    </>
                  )}
                  <button
                    onClick={() => setExceptions((prev) => prev.filter((_, idx) => idx !== i))}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-text-muted hover:text-[#F44B6E] border-none bg-transparent cursor-pointer"
                    title="Удалить"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
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
