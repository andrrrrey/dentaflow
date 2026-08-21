import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/** Рабочий интервал одного дня недели / исключения. */
export interface DayHours {
  start?: string;        // "09:00"
  end?: string;          // "18:00"
  break_start?: string | null;
  break_end?: string | null;
}

/** Исключение на конкретную дату (отпуск/замена). */
export interface ScheduleException extends DayHours {
  date: string;          // "YYYY-MM-DD"
  off?: boolean;
}

export interface DoctorProfile {
  doctor_id: string;
  name: string;
  description?: string | null;
  birth_date?: string | null;
  /** Ключ — день недели "0".."6" (Пн..Вс). */
  weekly_hours: Record<string, DayHours>;
  schedule_exceptions: ScheduleException[];
}

export interface DoctorProfileUpdate {
  birth_date?: string | null;
  weekly_hours?: Record<string, DayHours>;
  schedule_exceptions?: ScheduleException[];
}

export function useDoctorProfiles() {
  return useQuery<{ doctors: DoctorProfile[]; synced_at: string | null }>({
    queryKey: ["doctor-profiles"],
    queryFn: async () => {
      const { data } = await api.get("/doctor-profiles/");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

function toMin(v?: string | null): number | null {
  if (!v) return null;
  const [hh, mm] = v.split(":");
  const n = Number(hh) * 60 + Number(mm);
  return Number.isFinite(n) ? n : null;
}

function intervalCovers(cfg: DayHours, startMin: number, endMin: number): boolean {
  const ws = toMin(cfg.start);
  const we = toMin(cfg.end);
  if (ws === null || we === null) return true;
  if (startMin < ws || endMin > we) return false;
  const bs = toMin(cfg.break_start);
  const be = toMin(cfg.break_end);
  if (bs !== null && be !== null && be > bs && startMin < be && endMin > bs) return false;
  return true;
}

function hasActiveSchedule(p?: DoctorProfile | null): boolean {
  if (!p) return false;
  if (p.weekly_hours && Object.values(p.weekly_hours).some((c) => c?.start && c?.end)) return true;
  if (p.schedule_exceptions && p.schedule_exceptions.length > 0) return true;
  return false;
}

/**
 * Клиентская проверка попадания записи в график врача (совпадает с бэкендом).
 * `scheduledAt` — строка datetime-local "yyyy-MM-ddTHH:mm" (настенное время).
 * Возвращает true, если ограничений нет или время в графике.
 */
export function isWithinDoctorSchedule(
  profile: DoctorProfile | null | undefined,
  scheduledAt: string,
  durationMin: number,
): boolean {
  if (!hasActiveSchedule(profile) || !scheduledAt) return true;
  const [datePart, timePart] = scheduledAt.split("T");
  if (!datePart || !timePart) return true;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const startMin = hh * 60 + mm;
  const endMin = startMin + (durationMin || 30);
  if (endMin > 24 * 60) return false;
  // JS getDay(): Вс=0..Сб=6 → приводим к Пн=0..Вс=6.
  const jsDay = new Date(y, m - 1, d).getDay();
  const weekday = (jsDay + 6) % 7;

  for (const ex of profile!.schedule_exceptions || []) {
    if (ex.date !== datePart) continue;
    if (ex.off) return false;
    return intervalCovers(ex, startMin, endMin);
  }

  const cfg = profile!.weekly_hours?.[String(weekday)];
  if (!cfg || !cfg.start) return false;
  return intervalCovers(cfg, startMin, endMin);
}

/** Рабочий день врача на конкретную дату — для отрисовки серых (нерабочих) зон. */
export interface WorkingDay {
  /** false → график не задан, ограничивать/красить нечего. */
  restricted: boolean;
  /** Рабочие интервалы дня в минутах от 00:00 (перерыв уже вырезан). */
  segments: { start: number; end: number }[];
}

/**
 * Возвращает рабочие интервалы врача на дату `dateStr` ("YYYY-MM-DD").
 * Учитывает исключения (отпуск/замена), затем недельный график и перерыв.
 * Если график не задан — `restricted: false` (весь день считается рабочим).
 */
export function getWorkingDay(
  profile: DoctorProfile | null | undefined,
  dateStr: string,
): WorkingDay {
  if (!hasActiveSchedule(profile) || !dateStr) return { restricted: false, segments: [] };
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsDay = new Date(y, m - 1, d).getDay();
  const weekday = (jsDay + 6) % 7; // Пн=0..Вс=6

  let cfg: DayHours | null = null;
  const ex = profile!.schedule_exceptions?.find((e) => e.date === dateStr);
  if (ex) {
    if (ex.off) return { restricted: true, segments: [] };
    cfg = ex;
  } else {
    cfg = profile!.weekly_hours?.[String(weekday)] ?? null;
  }

  const ws = toMin(cfg?.start ?? null);
  const we = toMin(cfg?.end ?? null);
  if (!cfg || ws === null || we === null || we <= ws) return { restricted: true, segments: [] };

  const bs = toMin(cfg.break_start);
  const be = toMin(cfg.break_end);
  if (bs !== null && be !== null && be > bs && bs >= ws && be <= we) {
    return { restricted: true, segments: [{ start: ws, end: bs }, { start: be, end: we }] };
  }
  return { restricted: true, segments: [{ start: ws, end: we }] };
}

export function useUpdateDoctorProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ doctorId, ...body }: DoctorProfileUpdate & { doctorId: string }) =>
      api.put(`/doctor-profiles/${doctorId}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor-profiles"] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}
