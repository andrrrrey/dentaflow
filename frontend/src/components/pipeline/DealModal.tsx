import { useState } from "react";
import { X, Clock, ArrowRight } from "lucide-react";
import Button from "../ui/Button";
import { STAGES } from "../../api/deals";
import type { DealResponse, StageHistoryEntry } from "../../api/deals";

/* ── Helpers ───────────────────────────────────────────── */

function formatRub(v: number | null): string {
  if (v == null) return "";
  return v.toLocaleString("ru-RU").replace(/,/g, " ");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stageLabelByKey(key: string | null): string {
  if (!key) return "—";
  return STAGES.find((s) => s.key === key)?.label ?? key;
}

/* ── Component ─────────────────────────────────────────── */

interface DealModalProps {
  deal: DealResponse;
  history: StageHistoryEntry[];
  onClose: () => void;
  onSave: (dealId: string, updates: Partial<DealResponse>) => void;
}

export default function DealModal({
  deal,
  history,
  onClose,
  onSave,
}: DealModalProps) {
  const [stage, setStage] = useState(deal.stage);
  const [amount, setAmount] = useState(formatRub(deal.amount));
  const [notes, setNotes] = useState(deal.notes ?? "");

  const handleSave = () => {
    const parsedAmount = parseFloat(amount.replace(/\s/g, "")) || null;
    onSave(deal.id, {
      stage,
      amount: parsedAmount,
      notes: notes || null,
    });
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[200]"
        style={{
          background: "rgba(26,35,64,0.35)",
          backdropFilter: "blur(6px)",
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed z-[201] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[520px] max-h-[90vh] overflow-y-auto rounded-[20px] p-[24px]"
        style={{
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(24px)",
          border: "1.5px solid rgba(255,255,255,0.9)",
          boxShadow: "0 12px 48px rgba(91,76,245,0.18)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-[18px]">
          <div>
            <h2 className="text-[17px] font-extrabold text-text-main">
              {deal.patient_name ?? "Без пациента"}
            </h2>
            <p className="text-[13px] text-text-muted mt-[2px]">{deal.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[rgba(91,76,245,0.08)] transition-colors cursor-pointer"
          >
            <X size={18} className="text-text-muted" />
          </button>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-[16px] gap-y-[10px] text-[12.5px] mb-[18px]">
          <div>
            <span className="text-text-muted">Услуга</span>
            <div className="font-semibold text-text-main">{deal.service ?? "—"}</div>
          </div>
          <div>
            <span className="text-text-muted">Врач</span>
            <div className="font-semibold text-text-main">{deal.doctor_name ?? "—"}</div>
          </div>
          <div>
            <span className="text-text-muted">Ответственный</span>
            <div className="font-semibold text-text-main">
              {deal.assigned_to_name ?? "—"}
            </div>
          </div>
          <div>
            <span className="text-text-muted">Канал</span>
            <div className="font-semibold text-text-main">
              {deal.source_channel ?? "—"}
            </div>
          </div>
          {deal.lost_reason && (
            <div className="col-span-2">
              <span className="text-danger">Причина потери</span>
              <div className="font-semibold text-danger">{deal.lost_reason}</div>
            </div>
          )}
        </div>

        {/* Editable fields */}
        <div className="flex flex-col gap-[12px] mb-[18px]">
          {/* Stage */}
          <div>
            <label className="block text-[11px] font-semibold text-text-muted mb-[4px]">
              Этап
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full rounded-xl px-3 py-[8px] text-[13px] font-medium text-text-main outline-none cursor-pointer"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(91,76,245,0.15)",
              }}
            >
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[11px] font-semibold text-text-muted mb-[4px]">
              Сумма (\u20BD)
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl px-3 py-[8px] text-[13px] font-medium text-text-main outline-none"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(91,76,245,0.15)",
              }}
              placeholder="150 000"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-text-muted mb-[4px]">
              Заметки
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-xl px-3 py-[8px] text-[13px] font-medium text-text-main outline-none resize-none"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(91,76,245,0.15)",
              }}
              placeholder="Добавить заметку..."
            />
          </div>
        </div>

        {/* Stage history timeline */}
        {history.length > 0 && (
          <div className="mb-[18px]">
            <h3 className="text-[12px] font-bold text-text-muted mb-[8px]">
              История этапов
            </h3>
            <div className="flex flex-col gap-[6px]">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-[8px] text-[11.5px] text-text-muted"
                >
                  <Clock size={12} className="flex-shrink-0" />
                  <span className="font-semibold text-text-main">
                    {stageLabelByKey(h.from_stage)}
                  </span>
                  <ArrowRight size={11} className="flex-shrink-0" />
                  <span className="font-semibold text-text-main">
                    {stageLabelByKey(h.to_stage)}
                  </span>
                  <span className="ml-auto text-[10.5px]">
                    {formatDate(h.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-[10px]">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            Сохранить
          </Button>
        </div>
      </div>
    </>
  );
}
