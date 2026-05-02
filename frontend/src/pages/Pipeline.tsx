import { useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, List, LayoutGrid, ChevronLeft, ChevronRight, Trash2, GripVertical, Pencil, Check } from "lucide-react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Pill from "../components/ui/Pill";
import KanbanBoard from "../components/pipeline/KanbanBoard";
import DealModal from "../components/pipeline/DealModal";
import AddDealModal from "../components/pipeline/AddDealModal";
import { usePipelineQuery, useMoveDeal, useDeleteDeal } from "../api/deals";
import { usePatientsByStage } from "../api/pipeline_ext";
import { usePipelineStages, useRenameStage, useReorderStages } from "../api/pipelineStages";
import type { PipelineStage } from "../api/pipelineStages";
import type { DealResponse, PipelineResponse, StageColumn } from "../api/deals";

/* -- Helpers -- */

function formatValue(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + " млн ₽";
  return v.toLocaleString("ru-RU") + " ₽";
}

function uniqueAssigned(stages: StageColumn[]) {
  const map = new Map<string, string>();
  for (const col of stages) {
    for (const d of col.deals) {
      if (d.assigned_to && d.assigned_to_name) map.set(d.assigned_to, d.assigned_to_name);
    }
  }
  return Array.from(map, ([id, name]) => ({ id, name }));
}

const TABLE_PAGE = 20;

const FALLBACK_STAGE_LABELS: Record<string, string> = {
  waiting_list: "Лист ожидания",
  new: "Новые",
  contact: "Контакт",
  negotiation: "Переговоры",
  scheduled: "Записан",
  treatment: "Лечение",
  closed_won: "Закрыто ✓",
  closed_lost: "Закрыто ✗",
};

const FALLBACK_STAGE_COLOR: Record<string, string> = {
  waiting_list: "#a855f7",
  new: "#3B7FED",
  contact: "#F5A623",
  negotiation: "#F5A623",
  scheduled: "#5B4CF5",
  treatment: "#00C9A7",
  closed_won: "#00C9A7",
  closed_lost: "#f44b6e",
};

function buildStageMaps(stages: PipelineStage[] | undefined) {
  if (!stages?.length) return { labels: FALLBACK_STAGE_LABELS, colors: FALLBACK_STAGE_COLOR };
  const labels: Record<string, string> = {};
  const colors: Record<string, string> = {};
  for (const s of stages) {
    labels[s.key] = s.label;
    colors[s.key] = s.color;
  }
  return { labels, colors };
}


/* -- Patients panel -- */

function PatientsSidePanel({ stage, onClose }: { stage: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data, isLoading } = usePatientsByStage(stage);

  return (
    <div className="fixed right-0 top-0 h-full w-[380px] z-50 flex flex-col" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(24px)", borderLeft: "1px solid rgba(91,76,245,0.15)", boxShadow: "-8px 0 32px rgba(91,76,245,0.12)" }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(91,76,245,0.1)]">
        <div className="font-bold text-[14px]">Пациенты</div>
        <button onClick={onClose} className="text-text-muted hover:text-text-main"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="text-center text-text-muted text-[13px] mt-8">Загрузка...</div>
        ) : !data?.patients.length ? (
          <div className="text-center text-text-muted text-[13px] mt-8">Нет пациентов</div>
        ) : (
          data.patients.map((p) => (
            <div key={p.id} onClick={() => navigate(`/patients/${p.id}`)} className="flex items-center gap-3 p-3 rounded-xl mb-2 cursor-pointer hover:bg-[rgba(91,76,245,0.06)] transition-all border border-transparent hover:border-[rgba(91,76,245,0.1)]">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0" style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}>
                {p.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">{p.name}</div>
                <div className="text-[11px] text-text-muted">{p.phone || "—"}</div>
              </div>
              {p.is_new_patient && <Pill variant="blue">Новый</Pill>}
            </div>
          ))
        )}
      </div>
      {data && (
        <div className="px-5 py-3 border-t border-[rgba(91,76,245,0.1)] text-[12px] text-text-muted">
          Всего: {data.total}
        </div>
      )}
    </div>
  );
}

/* -- Component -- */

export default function Pipeline() {
  const { data: pipelineData, isLoading: pipelineLoading } = usePipelineQuery();
  const moveDealMutation = useMoveDeal();
  const deleteDealMutation = useDeleteDeal();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { data: apiStages } = usePipelineStages();
  const renameStageMutation = useRenameStage();
  const reorderStagesMutation = useReorderStages();

  const { labels: STAGE_LABELS, colors: STAGE_COLOR } = useMemo(() => buildStageMaps(apiStages), [apiStages]);

  const [selectedDeal, setSelectedDeal] = useState<DealResponse | null>(null);
  const [filterAssigned, setFilterAssigned] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [crmView, setCrmView] = useState<"kanban" | "table">("kanban");
  const [tablePage, setTablePage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [showStageManager, setShowStageManager] = useState(false);
  const dragItemRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);

  const handleRenameStage = useCallback((stageId: string, currentLabel: string) => {
    setEditingStageId(stageId);
    setEditLabel(currentLabel);
  }, []);

  const confirmRename = useCallback(() => {
    if (editingStageId && editLabel.trim()) {
      renameStageMutation.mutate({ id: editingStageId, label: editLabel.trim() });
    }
    setEditingStageId(null);
  }, [editingStageId, editLabel, renameStageMutation]);

  const handleDragStart = useCallback((idx: number) => { dragItemRef.current = idx; }, []);
  const handleDragEnter = useCallback((idx: number) => { dragOverRef.current = idx; }, []);
  const handleDragEnd = useCallback(() => {
    if (apiStages && dragItemRef.current !== null && dragOverRef.current !== null && dragItemRef.current !== dragOverRef.current) {
      const reordered = [...apiStages];
      const [removed] = reordered.splice(dragItemRef.current, 1);
      reordered.splice(dragOverRef.current, 0, removed);
      reorderStagesMutation.mutate(reordered.map((s) => s.id));
    }
    dragItemRef.current = null;
    dragOverRef.current = null;
  }, [apiStages, reorderStagesMutation]);

  const pipeline: PipelineResponse = pipelineData ?? { stages: [], total_pipeline_value: 0 };
  const assignedUsers = useMemo(() => uniqueAssigned(pipeline.stages), [pipeline.stages]);

  const filteredPipeline: PipelineResponse = useMemo(() => {
    if (!filterAssigned) return pipeline;
    let totalValue = 0;
    const stages: StageColumn[] = pipeline.stages.map((col) => {
      const filtered = col.deals.filter((d) => d.assigned_to === filterAssigned);
      const total = filtered.reduce((s, d) => s + (d.amount ?? 0), 0);
      totalValue += total;
      return { ...col, deals: filtered, count: filtered.length, total_amount: total };
    });
    return { stages, total_pipeline_value: totalValue };
  }, [pipeline, filterAssigned]);

  const handleMoveDeal = (dealId: string, toStage: string) => {
    moveDealMutation.mutate({ dealId, stage: toStage });
  };

  const allDeals = useMemo(() =>
    filteredPipeline.stages.flatMap((s) => s.deals)
      .filter((d) => !filterStage || d.stage === filterStage)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [filteredPipeline, filterStage],
  );
  const tablePages = Math.max(1, Math.ceil(allDeals.length / TABLE_PAGE));
  const tableRows = allDeals.slice((tablePage - 1) * TABLE_PAGE, tablePage * TABLE_PAGE);

  return (
    <div className="flex flex-col gap-4">
      {/* Stage manager toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowStageManager(!showStageManager)}
          className="text-[11px] text-accent2 font-semibold bg-transparent border-none cursor-pointer hover:underline"
        >
          {showStageManager ? "Скрыть настройку этапов" : "Настроить этапы воронки"}
        </button>
      </div>

      {/* Stage manager panel */}
      {showStageManager && apiStages && (
        <Card>
          <div className="text-[13px] font-bold mb-3">Этапы воронки</div>
          <div className="text-[11px] text-text-muted mb-3">Перетащите для изменения порядка. Дважды кликните для переименования.</div>
          <div className="flex flex-col gap-1">
            {apiStages.map((stage, idx) => (
              <div
                key={stage.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="flex items-center gap-2 px-3 py-[8px] rounded-[10px] hover:bg-[rgba(91,76,245,0.04)] cursor-grab active:cursor-grabbing transition-colors"
                style={{ borderLeft: `3px solid ${stage.color}` }}
              >
                <GripVertical size={13} className="text-text-muted flex-shrink-0" />
                {editingStageId === stage.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setEditingStageId(null); }}
                      autoFocus
                      className="flex-1 text-[12.5px] font-semibold rounded-[8px] px-2 py-1 outline-none"
                      style={{ border: "1px solid rgba(91,76,245,0.3)", background: "rgba(255,255,255,0.9)" }}
                    />
                    <button onClick={confirmRename} className="text-[#00C9A7] bg-transparent border-none cursor-pointer p-1"><Check size={14} /></button>
                  </div>
                ) : (
                  <span
                    className="text-[12.5px] font-semibold flex-1 cursor-text"
                    onDoubleClick={() => handleRenameStage(stage.id, stage.label)}
                  >
                    {stage.label}
                  </span>
                )}
                {!stage.is_system && editingStageId !== stage.id && (
                  <button
                    onClick={() => handleRenameStage(stage.id, stage.label)}
                    className="text-text-muted hover:text-accent2 bg-transparent border-none cursor-pointer p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Переименовать"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* CRM view */}
      <div className="flex flex-col gap-[14px] min-h-0">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
              <Plus size={14} className="mr-[5px]" />
              Добавить сделку
            </Button>
            <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)} className="rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none cursor-pointer" style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}>
              <option value="">Все ответственные</option>
              {assignedUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            {crmView === "table" && (
              <select value={filterStage} onChange={(e) => { setFilterStage(e.target.value); setTablePage(1); }} className="rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none cursor-pointer" style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}>
                <option value="">Все этапы</option>
                {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[13px] font-bold text-text-muted">
                Воронка: <span className="text-accent2">{formatValue(filteredPipeline.total_pipeline_value)}</span>
              </span>
              {/* View toggle */}
              <div className="flex gap-[2px] p-[3px] rounded-[10px]" style={{ background: "rgba(91,76,245,0.07)" }}>
                {([["kanban", <LayoutGrid size={13} />], ["table", <List size={13} />]] as const).map(([v, icon]) => (
                  <button key={v} onClick={() => setCrmView(v)} className="w-7 h-7 rounded-[7px] flex items-center justify-center border-none cursor-pointer transition-all"
                    style={crmView === v ? { background: "#fff", color: "#5B4CF5", boxShadow: "0 1px 6px rgba(91,76,245,0.15)" } : { background: "transparent", color: "#8a8fa5" }}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {pipelineLoading ? (
            <div className="text-center text-text-muted py-12 text-[13px]">Загрузка данных...</div>
          ) : crmView === "kanban" ? (
            <KanbanBoard pipeline={filteredPipeline} onMoveDeal={handleMoveDeal} onDealClick={setSelectedDeal} onDeleteDeal={(id) => deleteDealMutation.mutate(id)} />
          ) : (
            /* Table view */
            <div className="rounded-[18px] overflow-hidden" style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 4px 20px rgba(120,140,180,0.12)" }}>
              <div className="grid grid-cols-[1fr_140px_120px_120px_100px_36px] gap-3 px-[18px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
                {["Пациент / Сделка", "Услуга", "Врач", "Этап", "Сумма", ""].map((h) => (
                  <span key={h} className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider">{h}</span>
                ))}
              </div>
              {tableRows.length === 0 ? (
                <div className="text-center py-10 text-text-muted text-[13px]">Нет сделок</div>
              ) : tableRows.map((deal) => (
                <div key={deal.id} onClick={() => setSelectedDeal(deal)} className="grid grid-cols-[1fr_140px_120px_120px_100px_36px] gap-3 px-[18px] py-[12px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors cursor-pointer">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-text-main truncate">{deal.title}</div>
                    {deal.patient_name && <div className="text-[11px] text-text-muted truncate">{deal.patient_name}</div>}
                  </div>
                  <div className="text-[12px] text-text-muted truncate self-center">{deal.service ?? "—"}</div>
                  <div className="text-[12px] text-text-muted truncate self-center">{deal.doctor_name ?? "—"}</div>
                  <div className="self-center">
                    <span className="px-[8px] py-[2px] rounded-full text-[10.5px] font-bold" style={{ background: `${STAGE_COLOR[deal.stage] ?? "#8a8fa5"}20`, color: STAGE_COLOR[deal.stage] ?? "#8a8fa5" }}>
                      {STAGE_LABELS[deal.stage] ?? deal.stage}
                    </span>
                  </div>
                  <div className="text-[13px] font-bold text-text-main text-right self-center">
                    {deal.amount ? `${deal.amount.toLocaleString("ru-RU").replace(/,/g, " ")} ₽` : "—"}
                  </div>
                  <div className="self-center flex justify-center" onClick={(e) => e.stopPropagation()}>
                    {confirmDeleteId === deal.id ? (
                      <button
                        onClick={() => deleteDealMutation.mutate(deal.id, { onSuccess: () => setConfirmDeleteId(null) })}
                        className="px-[6px] py-[2px] rounded-md text-[9.5px] font-bold text-white border-none cursor-pointer"
                        style={{ background: "#F44B6E" }}
                        title="Подтвердить удаление"
                      >
                        Удалить
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(deal.id)}
                        className="w-7 h-7 rounded-[7px] flex items-center justify-center text-text-muted hover:text-[#F44B6E] hover:bg-[rgba(244,75,110,0.1)] transition-colors border-none cursor-pointer bg-transparent"
                        title="Удалить сделку"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {tablePages > 1 && (
                <div className="flex items-center justify-between px-[18px] py-[10px]">
                  <span className="text-[11px] text-text-muted">Стр. {tablePage} из {tablePages} · {allDeals.length} сделок</span>
                  <div className="flex gap-1">
                    <button onClick={() => setTablePage((p) => Math.max(1, p - 1))} disabled={tablePage === 1} className="w-7 h-7 rounded-[7px] flex items-center justify-center border-none cursor-pointer disabled:opacity-40" style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}><ChevronLeft size={13} /></button>
                    <button onClick={() => setTablePage((p) => Math.min(tablePages, p + 1))} disabled={tablePage === tablePages} className="w-7 h-7 rounded-[7px] flex items-center justify-center border-none cursor-pointer disabled:opacity-40" style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}><ChevronRight size={13} /></button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      {/* Deal modal */}
      {selectedDeal && (
        <DealModal
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
        />
      )}

      {/* Add deal modal */}
      {showAddModal && <AddDealModal onClose={() => setShowAddModal(false)} />}

      {/* Patients side panel */}
      {activeStage && <PatientsSidePanel stage={activeStage} onClose={() => setActiveStage(null)} />}
    </div>
  );
}
