import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus } from "lucide-react";
import Button from "../ui/Button";
import { useCreateDeal, STAGES } from "../../api/deals";
import type { DealCreateData } from "../../api/deals";

const inputStyle = {
  border: "1px solid rgba(91,76,245,0.15)",
  background: "rgba(255,255,255,0.5)",
};

interface AddDealModalProps {
  onClose: () => void;
}

export default function AddDealModal({ onClose }: AddDealModalProps) {
  const createMutation = useCreateDeal();
  const [form, setForm] = useState<DealCreateData>({
    title: "",
    patient_name: "",
    patient_phone: "",
    stage: "new",
    amount: undefined,
    service: "",
    doctor_name: "",
    source_channel: "manual",
    notes: "",
  });
  const [error, setError] = useState("");

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
      await createMutation.mutateAsync(form);
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
              <input value={form.patient_name ?? ""} onChange={(e) => set("patient_name", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Иванов Иван" />
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
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Услуга</label>
              <input value={form.service ?? ""} onChange={(e) => set("service", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Имплантация" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Врач</label>
              <input value={form.doctor_name ?? ""} onChange={(e) => set("doctor_name", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Козлова Е.А." />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Канал</label>
            <select value={form.source_channel ?? ""} onChange={(e) => set("source_channel", e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer" style={inputStyle}>
              <option value="manual">Ручной ввод</option>
              <option value="phone">Телефон</option>
              <option value="telegram">Telegram</option>
              <option value="website">Сайт</option>
              <option value="instagram">Instagram</option>
              <option value="referral">Рекомендация</option>
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
