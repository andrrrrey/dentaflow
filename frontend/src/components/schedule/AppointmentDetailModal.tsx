import { createPortal } from "react-dom";
import { X, Calendar, User, Phone, Mail, Tag, MapPin, Clock, ChevronDown, ExternalLink, UserCheck, Hash, MessageSquare, CreditCard, CheckCircle, Trash2, AlertTriangle } from "lucide-react";
import { format, parseISO, differenceInYears } from "date-fns";
import { ru } from "date-fns/locale";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Pill from "../ui/Pill";
import { useAppointmentDetail, useUpdateAppointmentStatus, useUpdateAppointment, useUpdateAppointmentPayment, useDeleteAppointment } from "../../api/schedule";
import { useDoctorsList } from "../../api/doctors";
import { useServices } from "../../api/directories";

const STATUS_OPTIONS = [
  { value: "unconfirmed", label: "Не подтверждён" },
  { value: "confirmed", label: "Подтверждён" },
  { value: "arrived", label: "Пациент пришёл" },
  { value: "cancelled", label: "Визит отменён" },
  { value: "completed", label: "Завершено" },
  { value: "no_show", label: "Не явился" },
];

const statusLabels: Record<string, string> = {
  confirmed: "Подтверждён",
  unconfirmed: "Не подтверждён",
  arrived: "Пациент пришёл",
  completed: "Завершено",
  cancelled: "Визит отменён",
  no_show: "Не явился",
};

// Выразительная палитра статусов (синхронизирована с календарём Schedule.tsx):
// зелёный — пришёл, фиолетовый — подтвердился, оранжевый — просто запись.
const statusPill: Record<string, { bg: string; color: string }> = {
  arrived: { bg: "rgba(16,185,129,0.18)", color: "#047857" },
  completed: { bg: "rgba(16,185,129,0.18)", color: "#047857" },
  confirmed: { bg: "rgba(124,58,237,0.16)", color: "#6d28d9" },
  unconfirmed: { bg: "rgba(245,158,11,0.2)", color: "#b45309" },
  cancelled: { bg: "rgba(244,75,110,0.14)", color: "#c52048" },
  no_show: { bg: "rgba(107,114,128,0.16)", color: "#4b5563" },
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

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  try {
    return differenceInYears(new Date(), new Date(birthDate));
  } catch {
    return null;
  }
}

interface Props {
  appointmentId: string;
  onClose: () => void;
}

export default function AppointmentDetailModal({ appointmentId, onClose }: Props) {
  const navigate = useNavigate();
  const { data, isLoading } = useAppointmentDetail(appointmentId);
  const updateStatus = useUpdateAppointmentStatus();
  const updateAppt = useUpdateAppointment();
  const updatePayment = useUpdateAppointmentPayment();
  const { data: doctorsData } = useDoctorsList();
  const { data: servicesData } = useServices();

  const deleteAppt = useDeleteAppointment();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);

  const [commentValue, setCommentValue] = useState<string>("");
  const [commentSaved, setCommentSaved] = useState(false);
  const [editingDateTime, setEditingDateTime] = useState(false);
  const [dateTimeValue, setDateTimeValue] = useState<string>("");
  const [discountInput, setDiscountInput] = useState<string>("");
  const [paymentInput, setPaymentInput] = useState<string>("");
  const [paid, setPaid] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);
  const doctorDropdownRef = useRef<HTMLDivElement>(null);

  const appt = data?.appointment;
  const patient = data?.patient;
  const raw = patient?.raw_1denta_data as Record<string, unknown> | null;

  // Initialise editable fields from loaded data
  useEffect(() => {
    if (appt) {
      setCommentValue(appt.comment ?? "");
      setDiscountInput(appt.discount != null ? String(appt.discount) : "");
      setPaymentInput(
        appt.payment_amount != null
          ? String(appt.payment_amount)
          : appt.revenue > 0
          ? String(appt.revenue)
          : ""
      );
      setPaid(false);
      setCommentSaved(false);
      setEditingDateTime(false);
      setDateTimeValue(appt.scheduled_at ? appt.scheduled_at.slice(0, 16) : "");
    }
  }, [appt?.id]); // reset only when appointment changes

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
      if (serviceDropdownRef.current && !serviceDropdownRef.current.contains(e.target as Node)) {
        setServiceDropdownOpen(false);
      }
      if (doctorDropdownRef.current && !doctorDropdownRef.current.contains(e.target as Node)) {
        setDoctorDropdownOpen(false);
      }
    }
    const anyOpen = statusDropdownOpen || serviceDropdownOpen || doctorDropdownOpen;
    if (anyOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statusDropdownOpen, serviceDropdownOpen, doctorDropdownOpen]);

  function handleStatusChange(newStatus: string) {
    setStatusDropdownOpen(false);
    updateStatus.mutate({ appointmentId, status: newStatus });
  }

  function handleServiceChange(newService: string) {
    setServiceDropdownOpen(false);
    updateAppt.mutate({ appointmentId, service: newService });
  }

  function handleDoctorChange(doctorName: string, doctorId?: string | null) {
    setDoctorDropdownOpen(false);
    updateAppt.mutate({ appointmentId, doctor_name: doctorName, ...(doctorId ? { doctor_id: doctorId } : {}) });
  }

  function handleCommentSave() {
    updateAppt.mutate(
      { appointmentId, comment: commentValue },
      {
        onSuccess: () => {
          setCommentSaved(true);
          setTimeout(() => setCommentSaved(false), 2000);
        },
      }
    );
  }

  function handleDateTimeSave() {
    if (!dateTimeValue) return;
    const scheduled_at = dateTimeValue.length === 16 ? `${dateTimeValue}:00` : dateTimeValue;
    updateAppt.mutate(
      { appointmentId, scheduled_at },
      { onSuccess: () => setEditingDateTime(false) }
    );
  }

  function handlePay() {
    const discount = discountInput !== "" ? parseFloat(discountInput) : null;
    const payment_amount = paymentInput !== "" ? parseFloat(paymentInput) : null;
    updatePayment.mutate(
      { appointmentId, discount, payment_amount },
      {
        onSuccess: () => setPaid(true),
      }
    );
  }

  const currentStatus = appt?.status ?? "";
  const averageCheck = raw?.average_check as number | null | undefined;
  const medicalCard = raw?.medical_card as string | null | undefined;
  const age = calcAge(patient?.birth_date ?? null);

  const servicesList = servicesData?.services ?? [];
  const doctorsList = doctorsData?.doctors ?? [];

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-[720px] max-h-[90vh] overflow-y-auto rounded-[20px] p-6 flex flex-col gap-5"
        style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(91,76,245,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[20px] font-extrabold leading-tight">
              {patient?.name || "Детали записи"}
              {age != null && (
                <span className="text-[14px] font-semibold text-text-muted ml-2">{age} лет</span>
              )}
            </h2>
            {appt?.external_id && !appt.external_id.startsWith("local-") && (
              <span className="flex items-center gap-1 text-[11px] text-text-muted mt-[2px]">
                <Hash size={10} />
                Визит № {appt.external_id}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {appt && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 px-3 py-[6px] rounded-xl text-[12px] font-semibold border-none cursor-pointer transition-all hover:opacity-80"
                style={{ background: "rgba(244,75,110,0.08)", color: "#c52048" }}
                title="Удалить запись"
              >
                <Trash2 size={13} />
                Удалить
              </button>
            )}
            <button onClick={onClose} className="text-text-muted hover:text-text-main">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Delete confirmation dialog */}
        {confirmDelete && appt && (
          <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(244,75,110,0.06)", border: "1.5px solid rgba(244,75,110,0.2)" }}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="flex-shrink-0 mt-[1px]" style={{ color: "#c52048" }} />
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-bold" style={{ color: "#c52048" }}>Удалить запись?</span>
                {appt.external_id && !appt.external_id.startsWith("local-") ? (
                  <span className="text-[12px] text-text-muted">
                    Эта запись синхронизирована с 1Denta (визит №&nbsp;{appt.external_id}).
                    Она будет удалена и из расписания DentaFlow, и из 1Denta.
                  </span>
                ) : (
                  <span className="text-[12px] text-text-muted">
                    Запись будет удалена из расписания DentaFlow. В 1Denta она не синхронизирована.
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-[6px] rounded-xl text-[12px] font-semibold border-none cursor-pointer"
                style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
              >
                Отмена
              </button>
              <button
                onClick={() => deleteAppt.mutate(appointmentId, { onSuccess: onClose })}
                disabled={deleteAppt.isPending}
                className="px-4 py-[6px] rounded-xl text-[12px] font-bold border-none cursor-pointer disabled:opacity-60"
                style={{ background: "rgba(244,75,110,0.85)", color: "#fff" }}
              >
                {deleteAppt.isPending ? "Удаление..." : "Да, удалить"}
              </button>
            </div>
          </div>
        )}

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
                {/* Date & time — editable */}
                <div className="flex items-start gap-2">
                  <span className="text-text-muted flex-shrink-0 mt-[1px]"><Calendar size={13} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-text-muted">Дата и время</div>
                    {editingDateTime ? (
                      <div className="flex flex-col gap-1 mt-1">
                        <input
                          type="datetime-local"
                          value={dateTimeValue}
                          onChange={(e) => setDateTimeValue(e.target.value)}
                          className="w-full text-[12.5px] font-medium px-2 py-[5px] rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/30 transition-all"
                          style={{ borderColor: "rgba(91,76,245,0.2)", background: "rgba(91,76,245,0.03)" }}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleDateTimeSave}
                            disabled={updateAppt.isPending}
                            className="px-3 py-[4px] rounded-lg text-[11px] font-semibold border-none cursor-pointer disabled:opacity-50"
                            style={{ background: "rgba(91,76,245,0.1)", color: "#5B4CF5" }}
                          >
                            {updateAppt.isPending ? "Сохранение..." : "Сохранить"}
                          </button>
                          <button
                            onClick={() => { setEditingDateTime(false); setDateTimeValue(appt.scheduled_at ? appt.scheduled_at.slice(0, 16) : ""); }}
                            className="px-3 py-[4px] rounded-lg text-[11px] font-semibold border-none cursor-pointer"
                            style={{ background: "rgba(120,130,150,0.1)", color: "#64748b" }}
                          >
                            Отмена
                          </button>
                        </div>
                        <span className="text-[10px] text-text-muted">Синхронизируется с 1Denta</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingDateTime(true)}
                        className="text-[12.5px] font-medium text-text-main hover:text-accent2 cursor-pointer border-none bg-transparent p-0 text-left"
                      >
                        {formatDt(appt.scheduled_at)}
                      </button>
                    )}
                  </div>
                </div>
                <InfoRow icon={<Clock size={13} />} label="Длительность" value={`${appt.duration_min} мин`} />
                <InfoRow icon={<MapPin size={13} />} label="Филиал" value={appt.branch || "—"} />
              </div>

              {/* Service with dropdown edit */}
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[12px] text-text-muted">Услуга:</span>
                {servicesList.length > 0 ? (
                  <div className="relative" ref={serviceDropdownRef}>
                    <button
                      onClick={() => setServiceDropdownOpen((o) => !o)}
                      className="flex items-center gap-1 text-[13px] font-medium text-text-main hover:text-accent2 cursor-pointer border-none bg-transparent p-0"
                      disabled={updateAppt.isPending}
                    >
                      {appt.service || "— Выбрать —"}
                      <ChevronDown size={11} className="text-text-muted ml-1" />
                    </button>
                    {serviceDropdownOpen && (
                      <div
                        className="absolute left-0 top-full mt-1 z-[300] rounded-xl overflow-y-auto flex flex-col"
                        style={{ background: "rgba(255,255,255,0.98)", boxShadow: "0 8px 24px rgba(91,76,245,0.18)", minWidth: 340, maxHeight: 320 }}
                      >
                        {servicesList.map((s) => (
                          <button
                            key={String(s.id)}
                            onClick={() => handleServiceChange(s.name)}
                            className="px-4 py-[8px] text-[12.5px] text-left border-none cursor-pointer hover:bg-[rgba(91,76,245,0.06)] transition-colors whitespace-normal leading-snug"
                            style={{ color: s.name === appt.service ? "#5B4CF5" : "#1e293b", fontWeight: s.name === appt.service ? 600 : 400 }}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-[13px] font-medium">{appt.service || "—"}</span>
                )}
              </div>

              {/* Doctor with dropdown edit */}
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-text-muted flex-shrink-0"><User size={13} className="inline mr-1" />Врач:</span>
                {doctorsList.length > 0 ? (
                  <div className="relative" ref={doctorDropdownRef}>
                    <button
                      onClick={() => setDoctorDropdownOpen((o) => !o)}
                      className="flex items-center gap-1 text-[13px] font-medium text-text-main hover:text-accent2 cursor-pointer border-none bg-transparent p-0"
                      disabled={updateAppt.isPending}
                    >
                      {appt.doctor_name || "— Выбрать —"}
                      <ChevronDown size={11} className="text-text-muted ml-1" />
                    </button>
                    {doctorDropdownOpen && (
                      <div
                        className="absolute left-0 top-full mt-1 z-[300] rounded-xl overflow-y-auto flex flex-col"
                        style={{ background: "rgba(255,255,255,0.98)", boxShadow: "0 8px 24px rgba(91,76,245,0.18)", minWidth: 220, maxHeight: 200 }}
                      >
                        {doctorsList.map((d) => (
                          <button
                            key={d.doctor_id ?? d.doctor_name}
                            onClick={() => handleDoctorChange(d.doctor_name, d.doctor_id)}
                            className="px-4 py-[8px] text-[12.5px] text-left border-none cursor-pointer hover:bg-[rgba(91,76,245,0.06)] transition-colors"
                            style={{ color: d.doctor_name === appt.doctor_name ? "#5B4CF5" : "#1e293b", fontWeight: d.doctor_name === appt.doctor_name ? 600 : 400 }}
                          >
                            {d.doctor_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-[13px] font-medium">{appt.doctor_name || "—"}</span>
                )}
              </div>

              {/* Status with change dropdown */}
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-text-muted">Статус:</span>
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setStatusDropdownOpen((o) => !o)}
                    className="flex items-center gap-1 px-3 py-[5px] rounded-xl text-[12.5px] font-semibold cursor-pointer border-none"
                    style={{
                      background: (statusPill[currentStatus ?? ""] ?? statusPill.unconfirmed).bg,
                      color: (statusPill[currentStatus ?? ""] ?? statusPill.unconfirmed).color,
                    }}
                    disabled={updateStatus.isPending}
                  >
                    {statusLabels[currentStatus] ?? currentStatus ?? "—"}
                    <ChevronDown size={12} className="ml-1" />
                  </button>
                  {statusDropdownOpen && (
                    <div
                      className="absolute left-0 top-full mt-1 z-[300] rounded-xl overflow-hidden flex flex-col"
                      style={{ background: "rgba(255,255,255,0.98)", boxShadow: "0 8px 24px rgba(91,76,245,0.18)", minWidth: 180 }}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => handleStatusChange(opt.value)}
                          className="px-4 py-[9px] text-[13px] text-left border-none cursor-pointer hover:bg-[rgba(91,76,245,0.06)] transition-colors"
                          style={{ color: opt.value === currentStatus ? "#5B4CF5" : "#1e293b", fontWeight: opt.value === currentStatus ? 600 : 400 }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* "Пациент пришёл" quick-action button */}
              {currentStatus !== "arrived" && currentStatus !== "completed" && currentStatus !== "cancelled" && (
                <button
                  onClick={() => handleStatusChange("arrived")}
                  disabled={updateStatus.isPending}
                  className="flex items-center justify-center gap-2 w-full mt-1 py-[10px] rounded-xl text-[13px] font-bold border-none cursor-pointer transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, rgba(0,201,167,0.15), rgba(0,201,167,0.08))", color: "#007d6e", border: "1.5px solid rgba(0,201,167,0.3)" }}
                >
                  <UserCheck size={15} />
                  Пациент пришёл
                </button>
              )}
              {(currentStatus === "arrived" || currentStatus === "completed") && (
                <div className="flex items-center justify-center gap-2 w-full mt-1 py-[10px] rounded-xl text-[13px] font-bold" style={{ background: "rgba(0,201,167,0.08)", color: "#007d6e" }}>
                  <UserCheck size={15} />
                  Пациент в клинике
                </div>
              )}
            </div>

            {/* Finance block */}
            <div className="flex flex-col gap-3 pt-3" style={{ borderTop: "1px solid rgba(91,76,245,0.08)" }}>
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Финансы</div>

              <div className="grid grid-cols-2 gap-3">
                {appt.external_id && !appt.external_id.startsWith("local-") && (
                  <InfoRow icon={<Hash size={13} />} label="Номер визита" value={appt.external_id} />
                )}
                {appt.revenue > 0 && (
                  <InfoRow icon={<CreditCard size={13} />} label="Сумма по прайсу" value={`${appt.revenue.toLocaleString("ru-RU")} ₽`} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Discount input */}
                <div>
                  <label className="block text-[10px] text-text-muted mb-1">Скидка (₽)</label>
                  <input
                    type="number"
                    min="0"
                    value={discountInput}
                    onChange={(e) => { setDiscountInput(e.target.value); setPaid(false); }}
                    placeholder="0"
                    className="w-full text-[13px] font-medium px-3 py-[7px] rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/30 transition-all"
                    style={{ borderColor: "rgba(91,76,245,0.2)", background: "rgba(91,76,245,0.03)" }}
                  />
                </div>
                {/* Payment amount input */}
                <div>
                  <label className="block text-[10px] text-text-muted mb-1">Сумма оплаты (₽)</label>
                  <input
                    type="number"
                    min="0"
                    value={paymentInput}
                    onChange={(e) => { setPaymentInput(e.target.value); setPaid(false); }}
                    placeholder="0"
                    className="w-full text-[13px] font-medium px-3 py-[7px] rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/30 transition-all"
                    style={{ borderColor: "rgba(91,76,245,0.2)", background: "rgba(91,76,245,0.03)" }}
                  />
                </div>
              </div>

              <button
                onClick={handlePay}
                disabled={updatePayment.isPending || paid}
                className="flex items-center justify-center gap-2 w-full py-[10px] rounded-xl text-[13px] font-bold border-none cursor-pointer transition-all disabled:opacity-60"
                style={
                  paid
                    ? { background: "rgba(0,201,167,0.12)", color: "#007d6e", border: "1.5px solid rgba(0,201,167,0.3)" }
                    : { background: "linear-gradient(135deg, #6c5ce7, #3b7fed)", color: "#fff" }
                }
              >
                {paid ? (
                  <>
                    <CheckCircle size={15} />
                    Оплачено
                  </>
                ) : (
                  <>
                    <CreditCard size={15} />
                    {updatePayment.isPending ? "Сохранение..." : "Оплатить"}
                  </>
                )}
              </button>
            </div>

            {/* Comment block */}
            <div className="flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid rgba(91,76,245,0.08)" }}>
              <div className="flex items-center gap-2">
                <MessageSquare size={13} className="text-text-muted" />
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Комментарий</span>
              </div>
              <textarea
                value={commentValue}
                onChange={(e) => { setCommentValue(e.target.value); setCommentSaved(false); }}
                rows={2}
                placeholder="Добавьте комментарий к записи..."
                className="w-full text-[13px] px-3 py-2 rounded-xl border resize-none focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/30 transition-all"
                style={{ borderColor: "rgba(91,76,245,0.2)", background: "rgba(91,76,245,0.03)" }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-text-muted">Комментарий синхронизируется с 1Denta</span>
                <button
                  onClick={handleCommentSave}
                  disabled={updateAppt.isPending}
                  className="px-4 py-[6px] rounded-xl text-[12px] font-semibold border-none cursor-pointer transition-all disabled:opacity-50"
                  style={
                    commentSaved
                      ? { background: "rgba(0,201,167,0.12)", color: "#007d6e" }
                      : { background: "rgba(91,76,245,0.1)", color: "#5B4CF5" }
                  }
                >
                  {commentSaved ? "Сохранено ✓" : "Сохранить"}
                </button>
              </div>
            </div>

            {/* Patient info */}
            {patient && (
              <div className="flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid rgba(91,76,245,0.08)" }}>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Пациент</div>
                  <button
                    onClick={() => { onClose(); navigate(`/patients/${patient.id}`); }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-accent2 hover:underline border-none bg-transparent cursor-pointer"
                  >
                    Карточка пациента
                    <ExternalLink size={11} />
                  </button>
                </div>
                <div className="flex items-center gap-3 mb-1">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-bold cursor-pointer hover:opacity-80"
                    style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
                    onClick={() => { onClose(); navigate(`/patients/${patient.id}`); }}
                  >
                    {patient.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => { onClose(); navigate(`/patients/${patient.id}`); }}
                      className="text-[15px] font-bold text-text-main hover:text-accent2 transition-colors border-none bg-transparent cursor-pointer p-0 text-left"
                    >
                      {patient.name}
                    </button>
                    <div className="flex items-center gap-2 flex-wrap">
                      {age !== null && <span className="text-[12px] text-text-muted">{age} лет</span>}
                      {medicalCard && (
                        <span className="text-[11px] px-2 py-[1px] rounded-md font-medium" style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
                          Карта №{medicalCard}
                        </span>
                      )}
                    </div>
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
                  <StatBox label="Средний чек" value={averageCheck != null ? `${averageCheck.toLocaleString("ru-RU")} ₽` : "—"} />
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
                      {raw.sex != null && Number(raw.sex) !== 0 && <InfoRow icon={<User size={13} />} label="Пол" value={sexLabels[raw.sex as number] || String(raw.sex)} />}
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
