import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { differenceInYears } from "date-fns";
import {
  CalendarPlus,
  PlusCircle,
  Mail,
  Phone,
  User,
  Users,
  Trash2,
  CreditCard,
  Wallet,
  Percent,
  FileText,
  Pencil,
} from "lucide-react";
import Pill from "../ui/Pill";
import Button from "../ui/Button";
import { useDeletePatient, useUpdatePatient } from "../../api/patients";
import type { PatientDetailResponse } from "../../api/patients";

interface PatientHeaderProps {
  patient: PatientDetailResponse;
  onAddDeal: () => void;
  onAddAppointment: () => void;
}

const channelLabel: Record<string, string> = {
  telegram: "Telegram",
  site: "Сайт",
  call: "Звонок",
  max: "Max/VK",
  referral: "Реферал",
};

const channelColor: Record<string, "blue" | "green" | "purple" | "yellow"> = {
  telegram: "blue",
  site: "green",
  call: "yellow",
  max: "purple",
  referral: "green",
};

function ltvColor(score: number | null): "green" | "yellow" | "red" | "blue" {
  if (score === null) return "blue";
  if (score >= 70) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

const repInputStyle = {
  border: "1px solid rgba(91,76,245,0.15)",
  background: "rgba(255,255,255,0.7)",
};

/** Родитель/представитель: данные ведутся в DentaFlow вручную —
 *  API 1Denta их не отдаёт. Для детей блок подсвечивается. */
function RepresentativeBlock({ patient }: { patient: PatientDetailResponse }) {
  const updatePatient = useUpdatePatient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: patient.representative_name ?? "",
    phone: patient.representative_phone ?? "",
    relation: patient.representative_relation ?? "",
  });

  const age = patient.birth_date
    ? differenceInYears(new Date(), new Date(patient.birth_date))
    : null;
  const isChild = age !== null && age < 18;
  const hasData = !!(patient.representative_name || patient.representative_phone);

  if (!isChild && !hasData && !editing) return null;

  function save() {
    updatePatient.mutate(
      {
        patientId: patient.id,
        representative_name: form.name,
        representative_phone: form.phone,
        representative_relation: form.relation,
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 mt-2 px-2.5 py-[6px] rounded-lg"
      style={{
        background: isChild ? "rgba(245,166,35,0.08)" : "rgba(91,76,245,0.05)",
        border: isChild ? "1px solid rgba(245,166,35,0.25)" : "1px solid rgba(91,76,245,0.08)",
      }}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: isChild ? "#b45309" : "#5B4CF5" }}>
        <Users size={13} />
        Представитель{isChild && age !== null ? ` (ребёнок, ${age} лет)` : ""}:
      </span>
      {editing ? (
        <span className="flex flex-wrap items-center gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="ФИО родителя"
            className="px-2 py-[4px] rounded-lg text-[12px] outline-none w-[180px]"
            style={repInputStyle}
          />
          <input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="+7(999)123-45-67"
            className="px-2 py-[4px] rounded-lg text-[12px] outline-none w-[150px]"
            style={repInputStyle}
          />
          <input
            value={form.relation}
            onChange={(e) => setForm((p) => ({ ...p, relation: e.target.value }))}
            placeholder="мама / папа / опекун"
            className="px-2 py-[4px] rounded-lg text-[12px] outline-none w-[130px]"
            style={repInputStyle}
          />
          <button
            onClick={save}
            disabled={updatePatient.isPending}
            className="px-2.5 py-[4px] rounded-lg text-[11px] font-bold border-none cursor-pointer disabled:opacity-50"
            style={{ background: "rgba(91,76,245,0.12)", color: "#5B4CF5" }}
          >
            {updatePatient.isPending ? "Сохранение..." : "Сохранить"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-2 py-[4px] rounded-lg text-[11px] font-semibold border-none cursor-pointer bg-transparent text-text-muted"
          >
            Отмена
          </button>
        </span>
      ) : hasData ? (
        <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-main">
          <span className="font-semibold">{patient.representative_name}</span>
          {patient.representative_relation && (
            <span className="text-text-muted">({patient.representative_relation})</span>
          )}
          {patient.representative_phone && (
            <span className="flex items-center gap-1 text-text-muted">
              <Phone size={11} />
              {patient.representative_phone}
            </span>
          )}
          <button
            onClick={() => setEditing(true)}
            title="Изменить"
            className="p-[3px] rounded-md border-none cursor-pointer bg-transparent text-text-muted hover:text-accent2"
          >
            <Pencil size={12} />
          </button>
        </span>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-[12px] font-semibold border-none cursor-pointer bg-transparent hover:underline"
          style={{ color: "#b45309" }}
        >
          + указать ФИО и телефон родителя
        </button>
      )}
    </div>
  );
}

export default function PatientHeader({ patient, onAddDeal, onAddAppointment }: PatientHeaderProps) {
  const navigate = useNavigate();
  const deletePatient = useDeletePatient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const raw = patient.raw_1denta_data as Record<string, unknown> | null;
  const medicalCard = raw?.medical_card as string | null | undefined;
  const balance = raw?.balance as number | null | undefined;
  const deposit = raw?.deposit as number | null | undefined;
  const discount = raw?.discount as number | null | undefined;

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    deletePatient.mutate(patient.id, {
      onSuccess: () => navigate("/patients"),
    });
  };

  return (
    <div
      className="rounded-glass p-[20px_22px]"
      style={{
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 20px rgba(120,140,180,0.18)",
      }}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        {/* Avatar */}
        <div
          className="w-[56px] h-[56px] rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
        >
          <User size={24} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-[20px] font-extrabold text-text-main truncate">
              {patient.name}
            </h1>
            {medicalCard && (
              <span className="flex items-center gap-1 px-2 py-[2px] rounded-lg text-[11px] font-semibold" style={{ background: "rgba(91,76,245,0.1)", color: "#5B4CF5" }}>
                <FileText size={11} />
                Карта №{medicalCard}
              </span>
            )}
            {patient.source_channel && (
              <Pill variant={channelColor[patient.source_channel] ?? "blue"}>
                {channelLabel[patient.source_channel] ?? patient.source_channel}
              </Pill>
            )}
            {patient.ltv_score !== null && (
              <Pill variant={ltvColor(patient.ltv_score)}>
                LTV {patient.ltv_score}
              </Pill>
            )}
            {patient.is_new_patient && (
              <Pill variant="purple">Новый</Pill>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[13px] text-text-muted">
            {patient.phone && (
              <span className="flex items-center gap-1.5">
                <Phone size={13} />
                {patient.phone}
              </span>
            )}
            {patient.email && (
              <span className="flex items-center gap-1.5">
                <Mail size={13} />
                {patient.email}
              </span>
            )}
          </div>

          {/* 1Denta financial info */}
          {(balance != null || deposit != null || discount != null) && (
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {balance != null && (
                <span
                  className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-lg text-[12px] font-semibold"
                  style={{
                    background: balance < 0 ? "rgba(244,75,110,0.08)" : "rgba(0,201,167,0.08)",
                    color: balance < 0 ? "#c52048" : "#007d6e",
                  }}
                >
                  <CreditCard size={12} />
                  Баланс: {balance.toLocaleString("ru-RU")} ₽
                </span>
              )}
              {deposit != null && deposit > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-lg text-[12px] font-semibold" style={{ background: "rgba(59,127,237,0.08)", color: "#2563eb" }}>
                  <Wallet size={12} />
                  Депозит: {deposit.toLocaleString("ru-RU")} ₽
                </span>
              )}
              {discount != null && discount > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-lg text-[12px] font-semibold" style={{ background: "rgba(245,166,35,0.08)", color: "#b45309" }}>
                  <Percent size={12} />
                  Скидка: {discount}%
                </span>
              )}
            </div>
          )}

          {/* Родитель / представитель (для детей) */}
          <RepresentativeBlock patient={patient} />

          {/* Tags */}
          {patient.tags && patient.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {patient.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-block px-[8px] py-[2px] rounded-full text-[10px] font-medium bg-[rgba(91,76,245,0.08)] text-[#5B4CF5]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Button variant="primary" size="sm" onClick={onAddAppointment}>
            <CalendarPlus size={14} className="mr-1.5" />
            Записать
          </Button>
          <Button variant="ghost" size="sm" onClick={onAddDeal}>
            <PlusCircle size={14} className="mr-1.5" />
            Создать сделку
          </Button>
          <button
            onClick={handleDelete}
            onBlur={() => setConfirmDelete(false)}
            disabled={deletePatient.isPending}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12px] font-semibold border transition-all cursor-pointer disabled:opacity-50 ${
              confirmDelete
                ? "border-[#f44b6e] bg-[rgba(244,75,110,0.08)] text-[#f44b6e]"
                : "border-[rgba(244,75,110,0.25)] bg-transparent text-[#f44b6e] hover:bg-[rgba(244,75,110,0.08)]"
            }`}
          >
            <Trash2 size={13} />
            {confirmDelete ? "Подтвердить удаление" : "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}
