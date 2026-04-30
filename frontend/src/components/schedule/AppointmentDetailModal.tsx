import { createPortal } from "react-dom";
import { X, Calendar, User, Phone, Mail, Tag, MapPin, Clock, CreditCard } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Pill from "../ui/Pill";
import { useAppointmentDetail } from "../../api/schedule";

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

const sexLabels: Record<number, string> = { 1: "Мужской", 2: "Женский" };

function formatDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMMM yyyy, HH:mm", { locale: ru });
  } catch {
    return "—";
  }
}

interface Props {
  appointmentId: string;
  onClose: () => void;
}

export default function AppointmentDetailModal({ appointmentId, onClose }: Props) {
  const { data, isLoading } = useAppointmentDetail(appointmentId);

  const appt = data?.appointment;
  const patient = data?.patient;
  const raw = patient?.raw_1denta_data as Record<string, unknown> | null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-[560px] max-h-[85vh] overflow-y-auto rounded-[20px] p-6 flex flex-col gap-5"
        style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(91,76,245,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold">Детали записи</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="text-center text-text-muted py-12 text-[13px]">Загрузка...</div>
        ) : !appt ? (
          <div className="text-center text-text-muted py-12 text-[13px]">Запись не найдена</div>
        ) : (
          <>
            {/* Appointment info */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Запись</div>
              <div className="grid grid-cols-2 gap-3">
                <InfoRow icon={<Calendar size={13} />} label="Дата и время" value={formatDt(appt.scheduled_at)} />
                <InfoRow icon={<Clock size={13} />} label="Длительность" value={`${appt.duration_min} мин`} />
                <InfoRow icon={<User size={13} />} label="Врач" value={appt.doctor_name || "—"} />
                <InfoRow icon={<MapPin size={13} />} label="Филиал" value={appt.branch || "—"} />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[12px] text-text-muted">Услуга:</span>
                <span className="text-[13px] font-medium">{appt.service || "—"}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-text-muted">Статус:</span>
                <Pill variant={statusVariant[appt.status ?? ""] ?? "gray"}>
                  {statusLabels[appt.status ?? ""] ?? appt.status ?? "—"}
                </Pill>
              </div>
              {appt.revenue > 0 && (
                <div className="flex items-center gap-3">
                  <CreditCard size={13} className="text-text-muted" />
                  <span className="text-[13px] font-semibold">{appt.revenue.toLocaleString("ru-RU")} ₽</span>
                </div>
              )}
            </div>

            {/* Patient info */}
            {patient && (
              <div className="flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid rgba(91,76,245,0.08)" }}>
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Пациент</div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-bold" style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}>
                    {patient.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[15px] font-bold">{patient.name}</div>
                    {patient.external_id && <div className="text-[11px] text-text-muted">ID: {patient.external_id}</div>}
                  </div>
                  {patient.is_new_patient && <Pill variant="blue">Новый</Pill>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {patient.phone && <InfoRow icon={<Phone size={13} />} label="Телефон" value={patient.phone} />}
                  {patient.email && <InfoRow icon={<Mail size={13} />} label="Email" value={patient.email} />}
                  {patient.birth_date && <InfoRow icon={<Calendar size={13} />} label="Дата рождения" value={patient.birth_date} />}
                  {patient.source_channel && <InfoRow icon={<Tag size={13} />} label="Канал" value={patient.source_channel} />}
                </div>

                <div className="grid grid-cols-3 gap-3 mt-2">
                  <StatBox label="Выручка" value={`${patient.total_revenue.toLocaleString("ru-RU")} ₽`} />
                  <StatBox label="LTV" value={patient.ltv_score != null ? `${patient.ltv_score}%` : "—"} />
                  <StatBox label="Посл. визит" value={patient.last_visit_at ? formatDt(patient.last_visit_at).split(",")[0] : "—"} />
                </div>

                {patient.tags && patient.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {patient.tags.map((t) => (
                      <span key={t} className="px-2 py-[2px] rounded-lg text-[11px] font-medium" style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Raw 1Denta data */}
                {raw && (
                  <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(91,76,245,0.06)" }}>
                    <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">Данные 1Denta</div>
                    <div className="grid grid-cols-2 gap-2">
                      {raw.sex != null && <InfoRow icon={<User size={13} />} label="Пол" value={sexLabels[raw.sex as number] || String(raw.sex)} />}
                      {raw.visits_count != null && <InfoRow icon={<Calendar size={13} />} label="Визитов" value={String(raw.visits_count)} />}
                      {raw.type != null && <InfoRow icon={<Tag size={13} />} label="Тип" value={String(raw.type)} />}
                      {raw.comment != null && <InfoRow icon={<Tag size={13} />} label="Комментарий" value={String(raw.comment)} />}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted flex-shrink-0">{icon}</span>
      <div>
        <div className="text-[10px] text-text-muted">{label}</div>
        <div className="text-[12.5px] font-medium">{value}</div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-2 text-center" style={{ background: "rgba(91,76,245,0.05)" }}>
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className="text-[13px] font-bold">{value}</div>
    </div>
  );
}
