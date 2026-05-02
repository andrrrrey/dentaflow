import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus } from "lucide-react";
import Button from "../ui/Button";
import PatientSearchInput from "../ui/PatientSearchInput";
import { useCreateAppointment, type CreateAppointmentData } from "../../api/schedule";
import { useDoctorsList } from "../../api/doctors";
import { useServices } from "../../api/directories";

const inputStyle = {
  border: "1px solid rgba(91,76,245,0.15)",
  background: "rgba(255,255,255,0.5)",
};

interface AddAppointmentModalProps {
  onClose: () => void;
  initialPatientName?: string;
  initialPatientPhone?: string;
}

export default function AddAppointmentModal({
  onClose,
  initialPatientName = "",
  initialPatientPhone = "",
}: AddAppointmentModalProps) {
  const createMutation = useCreateAppointment();
  const { data: doctorsData } = useDoctorsList();
  const { data: servicesData } = useServices();

  const doctors = doctorsData?.doctors ?? [];
  const services = servicesData?.services ?? [];

  const [form, setForm] = useState<CreateAppointmentData>({
    patient_name: initialPatientName,
    patient_phone: initialPatientPhone,
    doctor_id: doctors[0]?.doctor_id ?? "",
    doctor_name: doctors[0]?.doctor_name ?? "",
    service: "",
    scheduled_at: "",
    duration_min: 30,
    comment: "",
  });
  const [error, setError] = useState("");

  function set(key: keyof CreateAppointmentData, val: string | number) {
    setForm((p) => {
      const updated = { ...p, [key]: val };
      if (key === "doctor_id") {
        const doc = doctors.find((d) => d.doctor_id === val);
        if (doc) { updated.doctor_id = doc.doctor_id ?? ""; updated.doctor_name = doc.doctor_name; }
      }
      return updated;
    });
  }

  async function handleSubmit() {
    if (!form.patient_name || !form.patient_phone || !form.scheduled_at) {
      setError("Заполните обязательные поля");
      return;
    }
    setError("");
    try {
      await createMutation.mutateAsync(form);
      onClose();
    } catch {
      setError("Ошибка при создании записи");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-[480px] rounded-[20px] p-6 flex flex-col gap-4"
        style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(91,76,245,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">Новая запись</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Имя пациента *</label>
            <PatientSearchInput
              value={form.patient_name}
              onChangeName={(v) => setForm((p) => ({ ...p, patient_name: v }))}
              onSelectPatient={(_id, name, phone) => setForm((p) => ({ ...p, patient_name: name, patient_phone: phone }))}
              inputStyle={inputStyle}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Телефон *</label>
            <input value={form.patient_phone} onChange={(e) => set("patient_phone", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="+7 (999) 123-45-67" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Врач</label>
            <select
              value={form.doctor_id}
              onChange={(e) => set("doctor_id", e.target.value)}
              className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer"
              style={inputStyle}
            >
              {doctors.length === 0 && <option value="">Нет врачей</option>}
              {doctors.map((d) => <option key={d.doctor_id ?? d.doctor_name} value={d.doctor_id ?? ""}>{d.doctor_name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Услуга</label>
            {services.length > 0 ? (
              <select value={form.service} onChange={(e) => set("service", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer" style={inputStyle}>
                <option value="">— Выбрать услугу —</option>
                {services.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            ) : (
              <input value={form.service} onChange={(e) => set("service", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Консультация" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Дата и время *</label>
              <input type="datetime-local" value={form.scheduled_at} onChange={(e) => set("scheduled_at", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Длительность (мин)</label>
              <input type="number" value={form.duration_min} onChange={(e) => set("duration_min", Number(e.target.value))} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Комментарий</label>
            <textarea value={form.comment} onChange={(e) => set("comment", e.target.value)} rows={2} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none resize-none" style={inputStyle} placeholder="Дополнительная информация" />
          </div>
        </div>

        {error && <div className="text-[12px] text-[#c52048] font-medium">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Отмена</Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={createMutation.isPending}>
            <Plus size={14} className="mr-1" />
            {createMutation.isPending ? "Создание..." : "Создать запись"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
