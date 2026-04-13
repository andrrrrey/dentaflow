import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import Button from "../components/ui/Button";
import KanbanBoard from "../components/pipeline/KanbanBoard";
import DealModal from "../components/pipeline/DealModal";
import { usePipeline } from "../api/deals";
import type { DealResponse, PipelineResponse, StageColumn } from "../api/deals";

/* ── Helpers ───────────────────────────────────────────── */

function formatTotalValue(v: number): string {
  if (v >= 1_000_000) {
    return (v / 1_000_000).toFixed(1).replace(".", ",") + " млн \u20BD";
  }
  return v.toLocaleString("ru-RU").replace(/,/g, " ") + " \u20BD";
}

/* ── Unique assigned users from pipeline ───────────────── */

function uniqueAssigned(deals: DealResponse[]) {
  const map = new Map<string, string>();
  for (const d of deals) {
    if (d.assigned_to && d.assigned_to_name) {
      map.set(d.assigned_to, d.assigned_to_name);
    }
  }
  return Array.from(map, ([id, name]) => ({ id, name }));
}

/* ── Component ─────────────────────────────────────────── */

export default function Pipeline() {
  const { pipeline, deals, moveDeal, updateDeal, getHistory } = usePipeline();

  const [selectedDeal, setSelectedDeal] = useState<DealResponse | null>(null);
  const [filterAssigned, setFilterAssigned] = useState<string>("");

  const assignedUsers = useMemo(() => uniqueAssigned(deals), [deals]);

  // Filter pipeline by assigned_to if set
  const filteredPipeline: PipelineResponse = useMemo(() => {
    if (!filterAssigned) return pipeline;

    let totalValue = 0;
    const stages: StageColumn[] = pipeline.stages.map((col) => {
      const filtered = col.deals.filter(
        (d) => d.assigned_to === filterAssigned,
      );
      const total = filtered.reduce((s, d) => s + (d.amount ?? 0), 0);
      totalValue += total;
      return {
        ...col,
        deals: filtered,
        count: filtered.length,
        total_amount: total,
      };
    });
    return { stages, total_pipeline_value: totalValue };
  }, [pipeline, filterAssigned]);

  return (
    <div className="flex flex-col gap-[14px] h-full min-h-0">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-[12px]">
        <Button variant="primary" size="sm">
          <Plus size={14} className="mr-[5px]" />
          Добавить сделку
        </Button>

        {/* Assigned filter */}
        <select
          value={filterAssigned}
          onChange={(e) => setFilterAssigned(e.target.value)}
          className="rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none cursor-pointer"
          style={{
            background: "rgba(255,255,255,0.65)",
            border: "1px solid rgba(91,76,245,0.15)",
            backdropFilter: "blur(12px)",
          }}
        >
          <option value="">Все ответственные</option>
          {assignedUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        {/* Total pipeline value */}
        <div className="ml-auto text-[13px] font-bold text-text-muted">
          Воронка:{" "}
          <span className="text-accent2">
            {formatTotalValue(filteredPipeline.total_pipeline_value)}
          </span>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 min-h-0">
        <KanbanBoard
          pipeline={filteredPipeline}
          onMoveDeal={moveDeal}
          onDealClick={setSelectedDeal}
        />
      </div>

      {/* Deal modal */}
      {selectedDeal && (
        <DealModal
          deal={selectedDeal}
          history={getHistory(selectedDeal.id)}
          onClose={() => setSelectedDeal(null)}
          onSave={(dealId, updates) => {
            updateDeal(dealId, updates);
            // Update selectedDeal to reflect changes
            setSelectedDeal(null);
          }}
        />
      )}
    </div>
  );
}
