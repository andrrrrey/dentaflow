// Часовой пояс клиники. Времена записей хранятся как «настенные» часы
// клиники (как в 1Denta), поэтому «сейчас» для расписания нужно вычислять
// именно в этом поясе, независимо от таймзоны браузера.
// Улан-Удэ (UTC+8) в базе IANA покрывается зоной Asia/Irkutsk —
// отдельной зоны «Asia/Ulan_Ude» не существует.
export const CLINIC_TIME_ZONE = "Asia/Irkutsk";

// Запасной вариант, если браузер не знает зону: фиксированное смещение UTC+8.
const CLINIC_UTC_OFFSET_HOURS = 8;

/** Текущее время в часовом поясе клиники (как локальный Date c wall-clock клиники). */
export function clinicNow(): Date {
  try {
    return new Date(new Date().toLocaleString("en-US", { timeZone: CLINIC_TIME_ZONE }));
  } catch {
    const now = new Date();
    return new Date(now.getTime() + (CLINIC_UTC_OFFSET_HOURS * 60 + now.getTimezoneOffset()) * 60_000);
  }
}
