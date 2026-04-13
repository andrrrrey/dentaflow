import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import type { PipelineResponse, DealResponse } from "../../api/deals";
import KanbanColumn from "./KanbanColumn";
import DealCard from "./DealCard";

/* ── Component ─────────────────────────────────────────── */

interface KanbanBoardProps {
  pipeline: PipelineResponse;
  onMoveDeal: (dealId: string, toStage: string) => void;
  onDealClick: (deal: DealResponse) => void;
}

export default function KanbanBoard({
  pipeline,
  onMoveDeal,
  onDealClick,
}: KanbanBoardProps) {
  const [activeDeal, setActiveDeal] = useState<DealResponse | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const findDeal = useCallback(
    (id: string): DealResponse | undefined => {
      for (const col of pipeline.stages) {
        const found = col.deals.find((d) => d.id === id);
        if (found) return found;
      }
      return undefined;
    },
    [pipeline],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const deal = findDeal(String(event.active.id));
      setActiveDeal(deal ?? null);
    },
    [findDeal],
  );

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // visual feedback is handled by useDroppable isOver in KanbanColumn
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDeal(null);
      const { active, over } = event;
      if (!over) return;

      const dealId = String(active.id);
      const overId = String(over.id);

      // over can be a column stage key or another deal id
      // Check if overId is a stage key
      const isStage = pipeline.stages.some((s) => s.stage === overId);
      let targetStage: string;

      if (isStage) {
        targetStage = overId;
      } else {
        // dropped over another deal — find which column it belongs to
        const targetDeal = findDeal(overId);
        if (!targetDeal) return;
        targetStage = targetDeal.stage;
      }

      const sourceDeal = findDeal(dealId);
      if (!sourceDeal || sourceDeal.stage === targetStage) return;

      onMoveDeal(dealId, targetStage);
    },
    [pipeline, findDeal, onMoveDeal],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-[12px] overflow-x-auto pb-4 min-h-0">
        {pipeline.stages.map((col) => (
          <KanbanColumn
            key={col.stage}
            column={col}
            onDealClick={onDealClick}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDeal ? (
          <div style={{ width: 260 }}>
            <DealCard deal={activeDeal} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
