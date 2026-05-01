import { useState } from "react";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Tag, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  useDiscounts, useCreateDiscount, useUpdateDiscount, useDeleteDiscount,
  type DiscountCreate, type DiscountResponse,
} from "../../api/marketing";

const TYPE_LABEL: Record<string, string> = {
  percent: "Процент %",
  fixed: "Фиксированная ₽",
  bonus: "Бонусные баллы",
};

const APPLIES_OPTIONS = [
  { value: "all", label: "Все услуги" },
  { value: "new_patients", label: "Новые пациенты" },
  { value: "returning_patients", label: "Повторные пациенты" },
];

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d), "d MMM yyyy", { locale: ru }); } catch { return d; }
}

const inputCls = "rounded-[10px] px-3 py-[8px] text-[12.5px] text-text-main outline-none w-full";
const inputStyle = { background: "rgba(255,255,255,0.80)", border: "1px solid rgba(91,76,245,0.15)" };

const EMPTY: DiscountCreate = { name: "", type: "percent", value: 10, is_active: true };

function DiscountModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: DiscountResponse;
  onSave: (data: DiscountCreate & { id?: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<DiscountCreate>(
    initial
      ? { name: initial.name, type: initial.type, value: initial.value, code: initial.code ?? undefined,
          applies_to: initial.applies_to ?? undefined, valid_from: initial.valid_from ?? undefined,
          valid_to: initial.valid_to ?? undefined, min_purchase: initial.min_purchase ?? undefined,
          max_uses: initial.max_uses ?? undefined, is_active: initial.is_active,
          description: initial.description ?? undefined }
      : EMPTY
  );

  const set = (k: keyof DiscountCreate, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-[520px] rounded-[24px] p-6 flex flex-col gap-4"
        style={{ background: "rgba(255,255,255,0.97)", boxShadow: "0 20px 60px rgba(91,76,245,0.20)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">{initial ? "Редактировать скидку" : "Новая скидка"}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main border-none bg-transparent cursor-pointer"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Название *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} style={inputStyle} placeholder="Скидка на первичный приём" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Тип</label>
            <select value={form.type} onChange={(e) => set("type", e.target.value)} className={inputCls} style={inputStyle}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">
              Значение {form.type === "percent" ? "%" : form.type === "fixed" ? "₽" : "балл."}
            </label>
            <input type="number" value={form.value} onChange={(e) => set("value", Number(e.target.value))} className={inputCls} style={inputStyle} min={0} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Промокод</label>
            <input value={form.code ?? ""} onChange={(e) => set("code", e.target.value || undefined)} className={inputCls} style={inputStyle} placeholder="SUMMER25" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Применяется к</label>
            <select value={form.applies_to ?? "all"} onChange={(e) => set("applies_to", e.target.value)} className={inputCls} style={inputStyle}>
              {APPLIES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Действует с</label>
            <input type="date" value={form.valid_from ?? ""} onChange={(e) => set("valid_from", e.target.value || undefined)} className={inputCls} style={inputStyle} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Действует по</label>
            <input type="date" value={form.valid_to ?? ""} onChange={(e) => set("valid_to", e.target.value || undefined)} className={inputCls} style={inputStyle} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Мин. сумма ₽</label>
            <input type="number" value={form.min_purchase ?? ""} onChange={(e) => set("min_purchase", e.target.value ? Number(e.target.value) : undefined)} className={inputCls} style={inputStyle} placeholder="0" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Макс. использований</label>
            <input type="number" value={form.max_uses ?? ""} onChange={(e) => set("max_uses", e.target.value ? Number(e.target.value) : undefined)} className={inputCls} style={inputStyle} placeholder="Без ограничений" />
          </div>

          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Описание</label>
            <textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value || undefined)}
              className={inputCls + " resize-none"} style={inputStyle} rows={2} placeholder="Необязательное описание" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={() => onSave({ ...form, id: initial?.id })}
            disabled={!form.name}
            className="px-6 py-[10px] rounded-[12px] text-[13px] font-bold text-white border-none cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}>
            {initial ? "Сохранить" : "Создать"}
          </button>
          <button onClick={onClose} className="px-6 py-[10px] rounded-[12px] text-[13px] font-semibold border-none cursor-pointer"
            style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Discounts() {
  const { data, isLoading } = useDiscounts();
  const createMut = useCreateDiscount();
  const updateMut = useUpdateDiscount();
  const deleteMut = useDeleteDiscount();

  const [modal, setModal] = useState<"create" | DiscountResponse | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const items = (data?.items ?? []).filter((d) =>
    activeFilter === "all" ? true : activeFilter === "active" ? d.is_active : !d.is_active
  );

  function handleSave(form: DiscountCreate & { id?: string }) {
    if (form.id) {
      updateMut.mutate({ id: form.id, ...form }, { onSuccess: () => setModal(null) });
    } else {
      createMut.mutate(form, { onSuccess: () => setModal(null) });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-[2px] p-[3px] rounded-[11px]" style={{ background: "rgba(91,76,245,0.07)" }}>
          {(["all", "active", "inactive"] as const).map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className="px-4 py-[6px] rounded-[9px] text-[11.5px] font-semibold border-none cursor-pointer transition-all"
              style={activeFilter === f ? { background: "#fff", color: "#5B4CF5", boxShadow: "0 1px 6px rgba(91,76,245,0.15)" } : { background: "transparent", color: "#8a8fa5" }}>
              {f === "all" ? "Все" : f === "active" ? "Активные" : "Неактивные"}
            </button>
          ))}
        </div>
        <button onClick={() => setModal("create")}
          className="flex items-center gap-2 px-4 py-[9px] rounded-[12px] text-[13px] font-bold text-white border-none cursor-pointer"
          style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}>
          <Plus size={14} /> Новая скидка
        </button>
      </div>

      {/* Table */}
      <div className="rounded-[18px] overflow-hidden"
        style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 4px 20px rgba(120,140,180,0.12)" }}>
        <div className="grid grid-cols-[1fr_100px_80px_100px_120px_120px_80px] gap-3 px-[18px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
          {["Название", "Тип", "Размер", "Промокод", "Срок действия", "Использований", ""].map((h) => (
            <span key={h} className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {isLoading && <div className="text-center py-8 text-text-muted text-[13px]">Загрузка...</div>}
        {!isLoading && items.length === 0 && <div className="text-center py-8 text-text-muted text-[13px]">Нет скидок</div>}

        {items.map((d) => (
          <div key={d.id} className="grid grid-cols-[1fr_100px_80px_100px_120px_120px_80px] gap-3 px-[18px] py-[12px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.03)] items-center">
            <div>
              <div className="flex items-center gap-2">
                <Tag size={13} className="text-accent2 flex-shrink-0" />
                <span className="text-[13px] font-bold text-text-main">{d.name}</span>
                {!d.is_active && <span className="px-2 py-[1px] rounded-full text-[9.5px] bg-[rgba(0,0,0,0.06)] text-text-muted">неактивна</span>}
              </div>
              {d.description && <div className="text-[11px] text-text-muted mt-0.5 ml-5">{d.description}</div>}
            </div>
            <span className="text-[12px] text-text-muted">{TYPE_LABEL[d.type] ?? d.type}</span>
            <span className="text-[13px] font-bold text-accent2">
              {d.type === "percent" ? `${d.value}%` : d.type === "fixed" ? `${d.value} ₽` : `${d.value} б.`}
            </span>
            <span className="text-[12px] font-mono text-text-main">{d.code ?? "—"}</span>
            <span className="text-[11.5px] text-text-muted">
              {d.valid_from ? fmtDate(d.valid_from) : "∞"} — {d.valid_to ? fmtDate(d.valid_to) : "∞"}
            </span>
            <span className="text-[12px] text-text-muted">
              {d.used_count}{d.max_uses ? ` / ${d.max_uses}` : ""}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => updateMut.mutate({ id: d.id, is_active: !d.is_active })}
                className="w-7 h-7 flex items-center justify-center rounded-[7px] border-none cursor-pointer transition-colors"
                style={{ background: "rgba(91,76,245,0.07)", color: d.is_active ? "#00C9A7" : "#8a8fa5" }}
                title={d.is_active ? "Деактивировать" : "Активировать"}>
                {d.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              </button>
              <button onClick={() => setModal(d)}
                className="w-7 h-7 flex items-center justify-center rounded-[7px] border-none cursor-pointer" style={{ background: "rgba(91,76,245,0.07)", color: "#5B4CF5" }}>
                <Pencil size={13} />
              </button>
              <button onClick={() => { if (confirm("Удалить скидку?")) deleteMut.mutate(d.id); }}
                className="w-7 h-7 flex items-center justify-center rounded-[7px] border-none cursor-pointer" style={{ background: "rgba(244,75,110,0.08)", color: "#f44b6e" }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <DiscountModal
          initial={modal === "create" ? undefined : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
