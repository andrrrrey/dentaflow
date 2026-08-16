import { useEffect, useState } from "react";
import { Save, Gift } from "lucide-react";
import toast from "react-hot-toast";
import {
  useLoyaltyConfig,
  useSaveLoyaltyConfig,
  type LoyaltyConfig,
} from "../../api/loyalty";

const inputCls = "rounded-[10px] px-3 py-[8px] text-[13px] text-text-main outline-none w-full";
const inputStyle = { background: "rgba(255,255,255,0.80)", border: "1px solid rgba(91,76,245,0.15)" };

const cardStyle = {
  background: "rgba(255,255,255,0.65)",
  backdropFilter: "blur(18px)",
  border: "1px solid rgba(255,255,255,0.85)",
  boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
};

function NumberField({ label, hint, value, onChange }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wide">{label}</label>
      <input type="number" min={0} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputCls} style={inputStyle} />
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
    </div>
  );
}

export default function LoyaltySettings() {
  const { data, isLoading } = useLoyaltyConfig();
  const saveMut = useSaveLoyaltyConfig();
  const [form, setForm] = useState<LoyaltyConfig | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (isLoading || !form) {
    return <div className="text-center py-10 text-text-muted text-[13px]">Загрузка...</div>;
  }

  const set = (k: keyof LoyaltyConfig, v: number | boolean | string) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const mode = form.accrual_mode ?? "fixed";

  function handleSave() {
    if (!form) return;
    saveMut.mutate(form, {
      onSuccess: () => toast.success("Настройки сохранены"),
      onError: () => toast.error("Не удалось сохранить"),
    });
  }

  return (
    <div className="flex flex-col gap-4 max-w-[720px]">
      <div className="rounded-[18px] p-5 flex flex-col gap-4" style={cardStyle}>
        <div className="flex items-center gap-2">
          <Gift size={16} className="text-accent2" />
          <h2 className="text-[15px] font-bold">Начисление баллов</h2>
        </div>

        {/* Auto-accrual toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)}
            className="w-4 h-4 accent-accent2 cursor-pointer" />
          <span className="text-[13px] font-semibold text-text-main">
            Автоматически начислять баллы за оплаченные визиты
          </span>
        </label>

        {/* Accrual mode toggle */}
        <div className="flex flex-col gap-1 pt-1">
          <label className="text-[11px] font-bold text-text-muted uppercase tracking-wide">
            Как начислять за оплату
          </label>
          <div className="inline-flex rounded-[10px] p-[3px] w-fit"
            style={{ background: "rgba(91,76,245,0.08)", border: "1px solid rgba(91,76,245,0.15)" }}>
            {([
              { key: "fixed", label: "Фиксированно" },
              { key: "percent", label: "Процент от суммы" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => set("accrual_mode", opt.key)}
                className="px-4 py-[6px] rounded-[8px] text-[12px] font-bold border-none cursor-pointer transition-colors"
                style={mode === opt.key
                  ? { background: "linear-gradient(135deg,#5B4CF5,#3B7FED)", color: "#fff" }
                  : { background: "transparent", color: "var(--text-muted, #7a7a8c)" }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {mode === "percent" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <NumberField
              label="Процент от суммы, %"
              hint="Начисляется баллами от суммы оплаченного визита"
              value={form.percent_per_purchase}
              onChange={(v) => set("percent_per_purchase", v)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <NumberField
              label="Баллов за покупку"
              hint="Сколько баллов начислять за каждую сумму ниже"
              value={form.points_per_purchase_unit}
              onChange={(v) => set("points_per_purchase_unit", v)}
            />
            <NumberField
              label="За каждые, ₽"
              hint="Единица оплаты для начисления"
              value={form.purchase_rate_rubles}
              onChange={(v) => set("purchase_rate_rubles", v)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <NumberField
            label="Баллов за рекомендацию"
            hint="Начисляет администратор вручную по коду"
            value={form.referral_points}
            onChange={(v) => set("referral_points", v)}
          />
          <NumberField
            label="Баллов за отзыв"
            hint="Начисляет администратор после проверки"
            value={form.review_points}
            onChange={(v) => set("review_points", v)}
          />
        </div>

        <div className="text-[12px] text-text-muted rounded-[10px] px-3 py-2"
          style={{ background: "rgba(91,76,245,0.06)" }}>
          {mode === "percent" ? (
            <>Пример: {String(form.percent_per_purchase)}% от суммы —
              визит на 5&nbsp;000&nbsp;₽ принесёт{" "}
              <b>{Math.round((5000 * (form.percent_per_purchase || 0)) / 100)}</b> баллов.</>
          ) : (
            <>Пример: {form.points_per_purchase_unit} балл(ов) за каждые {form.purchase_rate_rubles} ₽ —
              визит на 5&nbsp;000&nbsp;₽ принесёт{" "}
              <b>{Math.floor(5000 / (form.purchase_rate_rubles || 1)) * form.points_per_purchase_unit}</b> баллов.</>
          )}
        </div>

        <div>
          <button onClick={handleSave} disabled={saveMut.isPending}
            className="flex items-center gap-2 px-5 py-[9px] rounded-[12px] text-[13px] font-bold text-white border-none cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}>
            <Save size={14} /> Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
