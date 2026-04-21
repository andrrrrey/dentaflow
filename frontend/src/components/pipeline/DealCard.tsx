import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Globe,
  Phone,
  MessageCircle,
  Send,
  Instagram,
  Clock,
} from "lucide-react";
import type { DealResponse } from "../../api/deals";

/* ── Helpers ───────────────────────────────────────────── */

function formatRub(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("ru-RU").replace(/,/g, " ") + " \u20BD";
}

function daysInStage(stageChangedAt: string): number {
  const diff = Date.now() - new Date(stageChangedAt).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const sourceIcons: Record<string, typeof Globe> = {
  website: Globe,
  phone: Phone,
  whatsapp: MessageCircle,
  telegram: Send,
  instagram: Instagram,
};

/* ── Component ─────────────────────────────────────────── */

interface DealCardProps {
  deal: DealResponse;
  onClick: () => void;
}

export default function DealCard({ deal, onClick }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: "rgba(255,255,255,0.62)",
    backdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.82)",
    boxShadow: isDragging
      ? "0 8px 28px rgba(91,76,245,0.18)"
      : "0 2px 10px rgba(120,140,180,0.10)",
  };

  const days = daysInStage(deal.stage_changed_at);
  const SourceIcon = sourceIcons[deal.source_channel ?? ""] ?? Globe;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-[14px] p-[14px] cursor-grab active:cursor-grabbing select-none"
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      {/* Patient name */}
      <div className="text-[13px] font-bold text-text-main truncate">
        {deal.patient_name ?? "Без пациента"}
      </div>

      {/* Service */}
      <div className="text-[11.5px] text-text-muted mt-[3px] truncate">
        {deal.service ?? deal.title}
      </div>

      {/* Amount + source icon */}
      <div className="flex items-center justify-between mt-[10px]">
        <span className="text-[13px] font-extrabold text-accent2">
          {formatRub(deal.amount)}
        </span>
        <SourceIcon size={13} className="text-text-muted flex-shrink-0" />
      </div>

      {/* Bottom row: days in stage + assigned avatar */}
      <div className="flex items-center justify-between mt-[8px]">
        <span className="flex items-center gap-1 text-[10.5px] text-text-muted">
          <Clock size={11} />
          {days} {days === 1 ? "день" : days >= 2 && days <= 4 ? "дня" : "дней"}
        </span>
        {deal.assigned_to_name && (
          <div
            className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
            title={deal.assigned_to_name}
          >
            {initials(deal.assigned_to_name)}
          </div>
        )}
      </div>
    </div>
  );
}
