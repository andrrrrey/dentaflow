// Часовой пояс клиники. Времена записей хранятся как «настенные» часы
// клиники (как в 1Denta), поэтому «сейчас» для расписания нужно вычислять
// именно в этом поясе, независимо от таймзоны браузера.
export const CLINIC_TIME_ZONE = "Asia/Ulan_Ude";

/** Текущее время в часовом поясе клиники (как локальный Date c wall-clock клиники). */
export function clinicNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: CLINIC_TIME_ZONE }));
}
