import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import clsx from "clsx";
import type { StageColumn } from "../../api/deals";
import type { DealResponse } from "../../api/deals";
import DealCard from "./DealCard";

/* ── Stage colour accents ──────────────────────────────── */

const stageColors: Record<string, { bg: string; text: string; dot: string }> = {
  new:         { bg: "rgba(59,127,237,0.08)",  text: "#3B7FED", dot: "#3B7FED" },
  contact:     { bg: "rgba(91,76,245,0.08)",   text: "#5B4CF5", dot: "#5B4CF5" },
  negotiation: { bg: "rgba(245,166,35,0.08)",  text: "#b87200", dot: "#F5A623" },
  scheduled:   { bg: "rgba(0,201,167,0.08)",   text: "#007d6e", dot: "#00C9A7" },
  treatment:   { bg: "rgba(91,76,245,0.08)",   text: "#5B4CF5", dot: "#5B4CF5" },
  closed_won:  { bg: "rgba(0,201,167,0.10)",   text: "#007d6e", dot: "#00C9A7" },
  closed_lost: { bg: "rgba(244,75,110,0.08)",  text: "#c52048", dot: "#F44B6E" },
};

function formatAmount(v: number): string {
  if (v === 0) return "0 \u20BD";
  return v.toLocaleString("ru-RU").replace(/,/g, " ") + " \u20BD";
}

/* ── Component ─────────────────────────────────────────── */

interface KanbanColumnProps {
  column: StageColumn;
  onDealClick: (deal: DealResponse) => void;
  onDeleteDeal?: (dealId: string) => void;
}

export default function KanbanColumn({ column, onDealClick, onDeleteDeal }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage });

  const colors = stageColors[column.stage] ?? stageColors.new;
  const dealIds = column.deals.map((d) => d.id);

  return (
    <div
      className={clsx(
        "flex flex-col flex-shrink-0 rounded-[16px] transition-colors duration-150",
        isOver && "ring-2 ring-accent2/30",
      )}
      style={{
        width: 280,
        minHeight: 200,
        background: colors.bg,
      }}
    >
      {/* Header */}
      <div className="px-[14px] pt-[14px] pb-[8px]">
        <div className="flex items-center gap-[8px]">
          <span
            className="w-[8px] h-[8px] rounded-full flex-shrink-0"
            style={{ background: colors.dot }}
          />
          <span
            className="text-[13px] font-bold truncate"
            style={{ color: colors.text }}
          >
            {column.label}
          </span>
          <span
            className="ml-auto text-[11px] font-bold px-[7px] py-[2px] rounded-full"
            style={{ background: "rgba(255,255,255,0.7)", color: colors.text }}
          >
            {column.count}
          </span>
        </div>
        <div className="text-[11px] text-text-muted mt-[4px] font-semibold">
          {formatAmount(column.total_amount)}
        </div>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto px-[10px] pb-[10px] flex flex-col gap-[8px]"
        style={{ maxHeight: "calc(100vh - 220px)" }}
      >
        <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
          {column.deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onClick={() => onDealClick(deal)}
              onDelete={onDeleteDeal}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
