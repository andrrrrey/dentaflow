import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import type { PatientStats as StatsType, AppointmentResponse } from "../../api/patients";
import { TrendingUp, Calendar, UserCheck, Stethoscope, XCircle, AlertTriangle, Database, BarChart2, CreditCard, FileText } from "lucide-react";

interface Props {
  stats: StatsType;
  rawData: Record<string, unknown> | null;
  appointments?: AppointmentResponse[];
}

function StatTile({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div
      className="rounded-[16px] p-[14px_16px] flex flex-col gap-2"
      style={{
        background: "rgba(255,255,255,0.70)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{label}</span>
        <span className="opacity-60">{icon}</span>
      </div>
      <div className="text-[22px] font-extrabold text-text-main leading-none">{value}</div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

function fmt(dt: string | null): string {
  if (!dt) return "—";
  try { return format(parseISO(dt), "d MMM yyyy", { locale: ru }); } catch { return dt; }
}

const FIELD_LABELS: Record<string, string> = {
  // Financial
  total_revenue: "Общая сумма",
  totalArrival: "Общая сумма",
  balance: "Баланс",
  discount: "Скидка",
  discountPercent: "Скидка, %",
  debt: "Долг",
  totalPaid: "Оплачено",
  bonuses: "Бонусы",
  price: "Стоимость",
  revenue: "Выручка",
  // Contact (these are excluded as duplicates)
  phone: "Телефон",
  email: "Email",
  name: "ФИО",
  firstName: "Имя",
  lastName: "Фамилия",
  patronymic: "Отчество",
  additionalPhone: "Доп. телефон",
  address: "Адрес",
  // Medical
  allergies: "Аллергии",
  diagnosis: "Диагноз",
  contraindications: "Противопоказания",
  notes: "Заметки",
  medicalNotes: "Мед. заметки",
  bloodType: "Группа крови",
  // Other common fields
  sex: "Пол",
  type: "Тип",
  comment: "Комментарий",
  birth_date: "Дата рождения",
  birthDate: "Дата рождения",
  external_id: "ID в 1Denta",
  visits_count: "Визитов (1Denta)",
  visitsCount: "Визитов (1Denta)",
  is_new_patient: "Новый пациент",
  ltv_score: "LTV",
  tags: "Теги",
  source_channel: "Источник",
};

const SEX_LABELS: Record<string, string> = { "0": "Другой", "1": "Мужской", "2": "Женский" };
const TYPE_LABELS: Record<string, string> = {
  noGroup: "Без группы",
  new: "Новый",
  potential: "Потенциальный",
  refuse: "Отказавшийся",
  refused: "Отказавшийся",
  regular: "Постоянный",
};

function formatFieldValue(key: string, val: unknown): string {
  if (val === null || val === undefined) return "—";
  const s = String(val);
  if (key === "sex") return SEX_LABELS[s] ?? s;
  if (key === "type") return TYPE_LABELS[s] ?? s;
  if (key === "is_new_patient") return s === "true" ? "Да" : "Нет";
  if ((key === "total_revenue" || key === "totalArrival" || key === "revenue" || key === "balance" || key === "debt") && !isNaN(Number(s))) {
    return Number(s).toLocaleString("ru-RU") + " ₽";
  }
  return s;
}

const DUPLICATE_CONTACT_KEYS = new Set(["phone", "email", "name", "firstName", "lastName", "patronymic", "additionalPhone"]);

function RawDataTile({ title, icon, entries }: { title: string; icon: React.ReactNode; entries: [string, unknown][] }) {
  return (
    <div
      className="rounded-[16px] p-[14px_16px] flex flex-col gap-3"
      style={{
        background: "rgba(255,255,255,0.70)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
      }}
    >
      <div className="flex items-center gap-2 text-[12px] font-bold text-text-muted">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {entries.map(([key, val]) => (
          <div key={key} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wide">
              {FIELD_LABELS[key] ?? key}
            </span>
            <span className="text-[12.5px] text-text-main font-medium">{formatFieldValue(key, val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PatientStats({ stats, rawData, appointments = [] }: Props) {
  const frequentServices = (() => {
    const counts = new Map<string, number>();
    for (const a of appointments) {
      if (a.service) counts.set(a.service, (counts.get(a.service) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();

  const favoriteDoctors = (() => {
    const counts = new Map<string, number>();
    for (const a of appointments) {
      if (a.doctor_name) counts.set(a.doctor_name, (counts.get(a.doctor_name) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();

  const rawGroups = (() => {
    if (!rawData || Object.keys(rawData).length === 0) return null;
    const medical: [string, unknown][] = [];
    const financial: [string, unknown][] = [];
    const other: [string, unknown][] = [];

    const medicalKeys = ["allergies", "diagnosis", "contraindications", "notes", "medicalNotes", "bloodType", "diseases", "health"];
    const financialKeys = ["total_revenue", "totalArrival", "balance", "discount", "discountPercent", "debt", "totalPaid", "bonuses", "price", "revenue"];

    for (const [key, val] of Object.entries(rawData)) {
      if (val === null || val === undefined || val === "") continue;
      if (typeof val === "object") continue;
      if (DUPLICATE_CONTACT_KEYS.has(key)) continue;
      const k = key.toLowerCase();
      if (medicalKeys.some(mk => k.includes(mk.toLowerCase()))) medical.push([key, val]);
      else if (financialKeys.some(fk => k === fk || k.includes(fk.toLowerCase()))) financial.push([key, val]);
      else other.push([key, val]);
    }

    return { medical, financial, other };
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile label="Всего визитов" value={stats.total_visits} icon={<Calendar size={16} className="text-accent2" />} />
        <StatTile label="Завершено" value={stats.completed_visits} icon={<UserCheck size={16} className="text-[#00C9A7]" />} />
        <StatTile label="Отменено" value={stats.cancelled_visits} icon={<XCircle size={16} className="text-[#F5A623]" />} />
        <StatTile label="Неявок" value={stats.no_show_visits} icon={<AlertTriangle size={16} className="text-[#f44b6e]" />} />
        <StatTile label="Врачей" value={stats.unique_doctors} icon={<Stethoscope size={16} className="text-accent2" />} />
        <StatTile label="Услуг" value={stats.unique_services} icon={<Stethoscope size={16} className="text-[#3B7FED]" />} />
      </div>

      {/* Revenue */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Суммарная выручка"
          value={`${stats.total_revenue.toLocaleString("ru-RU")} ₽`}
          icon={<TrendingUp size={16} className="text-accent2" />}
        />
        <StatTile
          label="Средний чек"
          value={stats.avg_revenue_per_visit > 0 ? `${Math.round(stats.avg_revenue_per_visit).toLocaleString("ru-RU")} ₽` : "—"}
          icon={<TrendingUp size={16} className="text-[#3B7FED]" />}
        />
      </div>

      {/* Visit dates */}
      <div
        className="rounded-[16px] p-[14px_16px] grid grid-cols-2 gap-4"
        style={{
          background: "rgba(255,255,255,0.70)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
        }}
      >
        <div>
          <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider mb-1">Первый визит</div>
          <div className="text-[14px] font-bold text-text-main">{fmt(stats.first_visit_at)}</div>
        </div>
        <div>
          <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider mb-1">Последний визит</div>
          <div className="text-[14px] font-bold text-text-main">{fmt(stats.last_visit_at)}</div>
        </div>
      </div>

      {/* Frequent services */}
      {frequentServices.length > 0 && (
        <div
          className="rounded-[16px] p-[14px_16px] flex flex-col gap-3"
          style={{
            background: "rgba(255,255,255,0.70)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
          }}
        >
          <div className="flex items-center gap-2 text-[12px] font-bold text-text-muted">
            <BarChart2 size={14} />
            Часто посещаемые услуги
          </div>
          <div className="flex flex-col gap-2">
            {frequentServices.map(([service, count]) => {
              const pct = Math.round((count / stats.total_visits) * 100);
              return (
                <div key={service} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-text-main truncate">{service}</div>
                    <div className="w-full h-[4px] rounded-full mt-1" style={{ background: "rgba(91,76,245,0.08)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#5B4CF5,#3B7FED)" }} />
                    </div>
                  </div>
                  <span className="text-[12px] font-bold text-accent2 flex-shrink-0">{count}×</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Favorite doctors */}
      {favoriteDoctors.length > 0 && (
        <div
          className="rounded-[16px] p-[14px_16px] flex flex-col gap-3"
          style={{
            background: "rgba(255,255,255,0.70)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
          }}
        >
          <div className="flex items-center gap-2 text-[12px] font-bold text-text-muted">
            <Stethoscope size={14} />
            Любимые врачи
          </div>
          <div className="flex flex-col gap-2">
            {favoriteDoctors.map(([doctor, count]) => {
              const pct = Math.round((count / stats.total_visits) * 100);
              return (
                <div key={doctor} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-text-main truncate">{doctor}</div>
                    <div className="w-full h-[4px] rounded-full mt-1" style={{ background: "rgba(0,201,167,0.12)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#00C9A7,#3B7FED)" }} />
                    </div>
                  </div>
                  <span className="text-[12px] font-bold text-[#00C9A7] flex-shrink-0">{count}×</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 1Denta data in separate tiles */}
      {rawGroups && (
        <>
          {rawGroups.medical.length > 0 && (
            <RawDataTile title="Медицинские данные" icon={<FileText size={14} />} entries={rawGroups.medical} />
          )}
          {rawGroups.financial.length > 0 && (
            <RawDataTile title="Финансы" icon={<CreditCard size={14} />} entries={rawGroups.financial} />
          )}
          {rawGroups.other.length > 0 && (
            <RawDataTile title="Данные из 1Denta" icon={<Database size={14} />} entries={rawGroups.other} />
          )}
        </>
      )}
    </div>
  );
}
