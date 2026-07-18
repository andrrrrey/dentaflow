import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, RefreshCw } from "lucide-react";
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
  initialDoctorId?: string;
  initialDoctorName?: string;
  /** "yyyy-MM-dd'T'HH:mm" — префилл при клике по свободному слоту */
  initialDateTime?: string;
}

export default function AddAppointmentModal({
  onClose,
  initialPatientName = "",
  initialPatientPhone = "",
  initialDoctorId = "",
  initialDoctorName = "",
  initialDateTime = "",
}: AddAppointmentModalProps) {
  const createMutation = useCreateAppointment();
  const { data: doctorsData } = useDoctorsList();
  const { data: servicesData } = useServices();

  const doctors = doctorsData?.doctors ?? [];
  // Запись создаётся сначала в 1Denta, поэтому доступны только услуги,
  // открытые там для онлайн-записи.
  const allOnlineServices = useMemo(
    () => (servicesData?.services ?? []).filter((s) => s.onlineRecord),
    [servicesData]
  );

  const [form, setForm] = useState<CreateAppointmentData>({
    patient_name: initialPatientName,
    patient_phone: initialPatientPhone,
    doctor_id: initialDoctorId,
    doctor_name: initialDoctorName,
    service: "",
    service_ids: [],
    scheduled_at: initialDateTime,
    duration_min: 30,
    comment: "",
  });
  const [error, setError] = useState("");

  // Список врачей приходит асинхронно — дефолт нельзя брать на первом рендере
  useEffect(() => {
    if (!form.doctor_id && doctors.length > 0) {
      setForm((p) =>
        p.doctor_id ? p : { ...p, doctor_id: doctors[0].doctor_id ?? "", doctor_name: doctors[0].doctor_name }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors.length]);

  // 1Denta принимает визит только с услугой, привязанной к выбранному врачу
  const onlineServices = useMemo(() => {
    if (!form.doctor_id) return allOnlineServices;
    return allOnlineServices.filter((s) => {
      const res = s.bookingResources;
      return !res || res.length === 0 || res.includes(String(form.doctor_id));
    });
  }, [allOnlineServices, form.doctor_id]);

  // При смене врача сбрасываем услугу, если она ему недоступна
  useEffect(() => {
    if (form.service && !onlineServices.some((s) => s.name === form.service)) {
      setForm((p) => ({ ...p, service: "", service_ids: [] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineServices]);

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
    if (!form.service_ids?.length) {
      setError("Выберите услугу — запись создаётся в 1Denta и без услуги невозможна");
      return;
    }
    setError("");
    try {
      await createMutation.mutateAsync(form);
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || e?.message || "Ошибка при создании записи");
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
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Услуга *</label>
            {onlineServices.length > 0 ? (
              <select
                value={form.service}
                onChange={(e) => {
                  const svc = onlineServices.find((s) => s.name === e.target.value) ?? null;
                  setForm((p) => ({
                    ...p,
                    service: e.target.value,
                    service_ids: svc ? [String(svc.id)] : [],
                    duration_min: svc?.duration ? Number(svc.duration) : p.duration_min,
                  }));
                }}
                className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer"
                style={inputStyle}
              >
                <option value="">— Выбрать услугу —</option>
                {onlineServices.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            ) : allOnlineServices.length > 0 ? (
              <div className="text-[12px] text-[#c52048] font-medium">
                У выбранного врача нет услуг, открытых для онлайн-записи в 1Denta. Выберите другого врача или привяжите услуги к врачу в настройках онлайн-записи 1Denta.
              </div>
            ) : (
              <div className="text-[12px] text-[#c52048] font-medium">
                Нет услуг, открытых для онлайн-записи в 1Denta. Откройте услуги для онлайн-записи в настройках 1Denta и запустите синхронизацию справочников (Настройки → 1Denta → Синхронизировать).
              </div>
            )}
            {form.service && (
              <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium mt-0.5"><RefreshCw size={11} />Запись будет создана в 1Denta</div>
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
