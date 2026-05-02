import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarPlus,
  PlusCircle,
  Mail,
  Phone,
  User,
  Trash2,
} from "lucide-react";
import Pill from "../ui/Pill";
import Button from "../ui/Button";
import { useDeletePatient } from "../../api/patients";
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

export default function PatientHeader({ patient, onAddDeal, onAddAppointment }: PatientHeaderProps) {
  const navigate = useNavigate();
  const deletePatient = useDeletePatient();
  const [confirmDelete, setConfirmDelete] = useState(false);

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
