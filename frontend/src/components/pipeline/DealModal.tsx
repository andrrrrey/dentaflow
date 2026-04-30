import { useState } from "react";
import { X, Clock, ArrowRight, MessageSquare, Send } from "lucide-react";
import Button from "../ui/Button";
import { STAGES, useUpdateDeal, useDealHistory, useDealNotes, useAddDealNote } from "../../api/deals";
import type { DealResponse } from "../../api/deals";

/* -- Helpers -- */

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

const inputStyle = {
  background: "rgba(255,255,255,0.7)",
  border: "1px solid rgba(91,76,245,0.15)",
};

/* -- Component -- */

interface DealModalProps {
  deal: DealResponse;
  onClose: () => void;
}

type ModalTab = "info" | "history" | "notes";

export default function DealModal({ deal, onClose }: DealModalProps) {
  const [tab, setTab] = useState<ModalTab>("info");

  const [stage, setStage] = useState(deal.stage);
  const [amount, setAmount] = useState(formatRub(deal.amount));
  const [title, setTitle] = useState(deal.title);
  const [service, setService] = useState(deal.service ?? "");
  const [doctorName, setDoctorName] = useState(deal.doctor_name ?? "");
  const [notes, setNotes] = useState(deal.notes ?? "");
  const [lostReason, setLostReason] = useState(deal.lost_reason ?? "");

  const updateMutation = useUpdateDeal();
  const { data: history } = useDealHistory(deal.id);
  const { data: dealNotes } = useDealNotes(deal.id);
  const addNoteMutation = useAddDealNote();
  const [newNote, setNewNote] = useState("");

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount.replace(/\s/g, "")) || null;
    await updateMutation.mutateAsync({
      dealId: deal.id,
      data: {
        stage: stage !== deal.stage ? stage : undefined,
        amount: parsedAmount !== deal.amount ? (parsedAmount ?? undefined) : undefined,
        title: title !== deal.title ? title : undefined,
        service: service !== (deal.service ?? "") ? service : undefined,
        doctor_name: doctorName !== (deal.doctor_name ?? "") ? doctorName : undefined,
        notes: notes !== (deal.notes ?? "") ? notes : undefined,
        lost_reason: lostReason !== (deal.lost_reason ?? "") ? lostReason : undefined,
      },
    });
    onClose();
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await addNoteMutation.mutateAsync({ dealId: deal.id, text: newNote.trim() });
    setNewNote("");
  };

  const tabs: { key: ModalTab; label: string }[] = [
    { key: "info", label: "Основное" },
    { key: "history", label: "История" },
    { key: "notes", label: "Заметки" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[200]" style={{ background: "rgba(26,35,64,0.35)", backdropFilter: "blur(6px)" }} onClick={onClose} />

      <div className="fixed z-[201] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-[20px] p-[24px]" style={{ background: "rgba(255,255,255,0.82)", backdropFilter: "blur(24px)", border: "1.5px solid rgba(255,255,255,0.9)", boxShadow: "0 12px 48px rgba(91,76,245,0.18)" }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[17px] font-extrabold text-text-main">{deal.patient_name ?? "Без пациента"}</h2>
            <p className="text-[13px] text-text-muted mt-[2px]">{deal.title}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[rgba(91,76,245,0.08)] transition-colors cursor-pointer">
            <X size={18} className="text-text-muted" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)] w-fit mb-4">
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)} className={`px-3 py-[5px] rounded-[9px] text-[12px] font-semibold transition-all border-none ${tab === key ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]" : "text-text-muted bg-transparent cursor-pointer"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Info tab */}
        {tab === "info" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-text-muted mb-1">Название сделки</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl px-3 py-[8px] text-[13px] font-medium text-text-main outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-text-muted mb-1">Этап</label>
                <select value={stage} onChange={(e) => setStage(e.target.value)} className="w-full rounded-xl px-3 py-[8px] text-[13px] font-medium text-text-main outline-none cursor-pointer" style={inputStyle}>
                  {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-text-muted mb-1">Сумма (₽)</label>
                <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl px-3 py-[8px] text-[13px] font-medium text-text-main outline-none" style={inputStyle} placeholder="150 000" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-text-muted mb-1">Услуга</label>
                <input value={service} onChange={(e) => setService(e.target.value)} className="w-full rounded-xl px-3 py-[8px] text-[13px] font-medium text-text-main outline-none" style={inputStyle} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-text-muted mb-1">Врач</label>
                <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} className="w-full rounded-xl px-3 py-[8px] text-[13px] font-medium text-text-main outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-text-muted mb-1">Канал</label>
                <div className="rounded-xl px-3 py-[8px] text-[13px] text-text-muted" style={{ background: "rgba(120,140,180,0.06)", border: "1px solid rgba(91,76,245,0.1)" }}>
                  {deal.source_channel ?? "—"}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text-muted mb-1">Ответственный</label>
              <div className="rounded-xl px-3 py-[8px] text-[13px] text-text-muted" style={{ background: "rgba(120,140,180,0.06)", border: "1px solid rgba(91,76,245,0.1)" }}>
                {deal.assigned_to_name ?? "—"}
              </div>
            </div>

            {(stage === "closed_lost" || deal.lost_reason) && (
              <div>
                <label className="block text-[11px] font-semibold text-text-muted mb-1">Причина потери</label>
                <input value={lostReason} onChange={(e) => setLostReason(e.target.value)} className="w-full rounded-xl px-3 py-[8px] text-[13px] font-medium text-text-main outline-none" style={inputStyle} placeholder="Причина..." />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-text-muted mb-1">Заметки</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-xl px-3 py-[8px] text-[13px] font-medium text-text-main outline-none resize-none" style={inputStyle} placeholder="Добавить заметку..." />
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Отмена</Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        )}

        {/* History tab */}
        {tab === "history" && (
          <div className="flex flex-col gap-2">
            {!history?.length ? (
              <div className="text-center text-text-muted text-[13px] py-8">Нет истории изменений</div>
            ) : (
              history.map((h) => (
                <div key={h.id} className="flex items-center gap-2 text-[12px] text-text-muted py-2 border-b border-[rgba(91,76,245,0.06)]">
                  <Clock size={13} className="flex-shrink-0 text-accent2" />
                  <span className="font-semibold text-text-main">{stageLabelByKey(h.from_stage)}</span>
                  <ArrowRight size={12} className="flex-shrink-0" />
                  <span className="font-semibold text-text-main">{stageLabelByKey(h.to_stage)}</span>
                  {h.comment && <span className="text-[11px] italic">({h.comment})</span>}
                  <span className="ml-auto text-[10.5px]">{formatDate(h.created_at)}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Notes tab */}
        {tab === "notes" && (
          <div className="flex flex-col gap-3">
            {/* Add note */}
            <div className="flex gap-2">
              <input value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }} className="flex-1 rounded-xl px-3 py-[8px] text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Написать заметку..." />
              <Button variant="primary" size="sm" onClick={handleAddNote} disabled={addNoteMutation.isPending || !newNote.trim()}>
                <Send size={13} />
              </Button>
            </div>

            {/* Notes list */}
            {!dealNotes?.length ? (
              <div className="text-center text-text-muted text-[13px] py-6">Нет заметок</div>
            ) : (
              dealNotes.map((n) => (
                <div key={n.id} className="p-3 rounded-xl" style={{ background: "rgba(91,76,245,0.04)", border: "1px solid rgba(91,76,245,0.08)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-semibold text-text-main flex items-center gap-1">
                      <MessageSquare size={12} className="text-accent2" />
                      {n.author_name ?? "Система"}
                    </span>
                    <span className="text-[10.5px] text-text-muted">{formatDate(n.created_at)}</span>
                  </div>
                  <p className="text-[12.5px] text-text-main">{n.text}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
