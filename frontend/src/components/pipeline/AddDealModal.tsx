import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus } from "lucide-react";
import Button from "../ui/Button";
import PatientSearchInput from "../ui/PatientSearchInput";
import { useCreateDeal } from "../../api/deals";
import { usePipelineStages } from "../../api/pipelineStages";
import { useDoctorsList } from "../../api/doctors";
import { useIntegrations } from "../../api/integrations";
import { useServices } from "../../api/directories";
import type { DealCreateData } from "../../api/deals";

const inputStyle = {
  border: "1px solid rgba(91,76,245,0.15)",
  background: "rgba(255,255,255,0.5)",
};

const CHANNEL_LABELS: Record<string, string> = {
  manual: "Ручной ввод",
  telegram: "Telegram",
  novofon: "Телефон (Novofon)",
  site: "Сайт",
  max_vk: "ВКонтакте / MAX",
  mail: "Email",
};

const CHANNEL_INTEGRATION_KEYS: Record<string, string> = {
  telegram: "telegram_bot_token",
  novofon: "novofon_api_key",
  site: "site_webhook_url",
  max_vk: "max_api_key",
  mail: "mail_host",
};

interface AddDealModalProps {
  onClose: () => void;
  initialPatientId?: string;
  initialPatientName?: string;
  initialPatientPhone?: string;
  onCreated?: (dealId: string) => void;
}

export default function AddDealModal({
  onClose,
  initialPatientId,
  initialPatientName = "",
  initialPatientPhone = "",
  onCreated,
}: AddDealModalProps) {
  const createMutation = useCreateDeal();
  const { data: apiStages } = usePipelineStages();
  const { data: doctorsList } = useDoctorsList();
  const { data: integrations } = useIntegrations();
  const { data: servicesData } = useServices();

  const [form, setForm] = useState<DealCreateData & { patient_id?: string }>({
    title: initialPatientName ? `Лид: ${initialPatientName}` : "",
    patient_id: initialPatientId,
    patient_name: initialPatientName,
    patient_phone: initialPatientPhone,
    stage: "new",
    amount: undefined,
    service: "",
    doctor_name: "",
    source_channel: "manual",
    notes: "",
  });
  const [error, setError] = useState("");

  // Exclude system terminal/auto stages from deal creation form
  const EXCLUDED_STAGES = new Set(["waiting_list", "closed_won", "closed_lost"]);
  const stages = (apiStages ?? [])
    .filter((s) => !EXCLUDED_STAGES.has(s.key))
    .map((s) => ({ key: s.key, label: s.label }));
  const services = servicesData?.services ?? [];

  const connectedChannels = (() => {
    const channels: { key: string; label: string }[] = [{ key: "manual", label: "Ручной ввод" }];
    if (!integrations) return channels;
    for (const [channelKey, settingKey] of Object.entries(CHANNEL_INTEGRATION_KEYS)) {
      const val = integrations[settingKey];
      if (val && !val.startsWith("****") && val !== "") {
        channels.push({ key: channelKey, label: CHANNEL_LABELS[channelKey] ?? channelKey });
      }
    }
    return channels;
  })();

  function set(key: keyof DealCreateData, val: string | number | undefined) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSubmit() {
    if (!form.title || !form.patient_name || !form.patient_phone) {
      setError("Заполните название, имя и телефон");
      return;
    }
    setError("");
    try {
      const result = await createMutation.mutateAsync(form);
      onCreated?.(result.id);
      onClose();
    } catch {
      setError("Ошибка при создании сделки");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-[500px] rounded-[20px] p-6 flex flex-col gap-4"
        style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(91,76,245,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">Новая сделка</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Название сделки *</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Имплантация зубов" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Имя пациента *</label>
              <PatientSearchInput
                value={form.patient_name ?? ""}
                onChangeName={(v) => set("patient_name", v)}
                onSelectPatient={(id, name, phone) => setForm((p) => ({ ...p, patient_id: id, patient_name: name, patient_phone: phone }))}
                inputStyle={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Телефон *</label>
              <input value={form.patient_phone ?? ""} onChange={(e) => set("patient_phone", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="+7 (999) 123-45-67" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Сумма (₽)</label>
              <input type="number" value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value ? Number(e.target.value) : undefined)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="150000" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Этап</label>
              <select value={form.stage} onChange={(e) => set("stage", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer" style={inputStyle}>
                {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Услуга</label>
              {services.length > 0 ? (
                <select value={form.service ?? ""} onChange={(e) => set("service", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer" style={inputStyle}>
                  <option value="">— Выбрать услугу —</option>
                  {services.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              ) : (
                <input value={form.service ?? ""} onChange={(e) => set("service", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Имплантация" />
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Врач</label>
              <select value={form.doctor_name ?? ""} onChange={(e) => set("doctor_name", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer" style={inputStyle}>
                <option value="">— Выбрать врача —</option>
                {doctorsList?.doctors.map((d) => (
                  <option key={d.doctor_id ?? d.doctor_name} value={d.doctor_name}>{d.doctor_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Канал</label>
            <select value={form.source_channel ?? ""} onChange={(e) => set("source_channel", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer" style={inputStyle}>
              {connectedChannels.map((ch) => (
                <option key={ch.key} value={ch.key}>{ch.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Заметки</label>
            <textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none resize-none" style={inputStyle} placeholder="Дополнительная информация" />
          </div>
        </div>

        {error && <div className="text-[12px] text-[#c52048] font-medium">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Отмена</Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={createMutation.isPending}>
            <Plus size={14} className="mr-1" />
            {createMutation.isPending ? "Создание..." : "Создать сделку"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
