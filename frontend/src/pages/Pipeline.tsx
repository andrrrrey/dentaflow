import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, List, LayoutGrid, ChevronLeft, ChevronRight } from "lucide-react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Pill from "../components/ui/Pill";
import KanbanBoard from "../components/pipeline/KanbanBoard";
import DealModal from "../components/pipeline/DealModal";
import AddDealModal from "../components/pipeline/AddDealModal";
import { usePipelineQuery, useMoveDeal } from "../api/deals";
import { useFunnel, usePatientsByStage } from "../api/pipeline_ext";
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

const FUNNEL_COLORS = ["#5B4CF5", "#3B7FED", "#00C9A7", "#F5A623", "#F44B6E", "#a855f7"];
const TABLE_PAGE = 20;

const STAGE_LABELS: Record<string, string> = {
  waiting_list: "Лист ожидания",
  new: "Новые",
  contact: "Контакт",
  negotiation: "Переговоры",
  scheduled: "Записан",
  treatment: "Лечение",
  closed_won: "Закрыто ✓",
  closed_lost: "Закрыто ✗",
};

const STAGE_COLOR: Record<string, string> = {
  waiting_list: "#a855f7",
  new: "#3B7FED",
  contact: "#F5A623",
  negotiation: "#F5A623",
  scheduled: "#5B4CF5",
  treatment: "#00C9A7",
  closed_won: "#00C9A7",
  closed_lost: "#f44b6e",
};

const qualityVariant: Record<string, "green" | "yellow" | "red" | "gray"> = {
  "Горячий": "green",
  "Хорошо": "green",
  "Средний": "yellow",
  "Слабый": "red",
  "Плохой": "red",
};

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
  const { data: funnel, isLoading: funnelLoading } = useFunnel();

  const [selectedDeal, setSelectedDeal] = useState<DealResponse | null>(null);
  const [filterAssigned, setFilterAssigned] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"funnel" | "crm">("funnel");
  const [crmView, setCrmView] = useState<"kanban" | "table">("kanban");
  const [tablePage, setTablePage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);

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
      {/* Tabs */}
      <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)] w-fit">
        {([["funnel", "Воронка пациентов"], ["crm", "CRM Воронка"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-[6px] rounded-[9px] text-[12.5px] font-semibold transition-all border-none ${activeTab === key ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]" : "text-text-muted bg-transparent cursor-pointer"}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "funnel" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Funnel bars */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="text-[14px] font-bold">Воронка пациентов</div>
              <button onClick={() => setActiveTab("crm")} className="text-[12px] text-accent2 font-semibold">Воронка CRM →</button>
            </div>
            {funnelLoading ? (
              <div className="text-center text-text-muted py-8 text-[13px]">Загрузка...</div>
            ) : (
              <div className="flex flex-col gap-[9px]">
                {(funnel?.stages ?? []).map((stage, i) => (
                  <div key={stage.key} className="flex items-center gap-[10px] cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setActiveStage(stage.key)}>
                    <div className="text-[12px] text-text-muted w-[150px] flex-shrink-0 truncate">{stage.label}</div>
                    <div className="flex-1 rounded-[6px] h-[8px] overflow-hidden" style={{ background: "rgba(91,76,245,0.07)" }}>
                      <div className="h-full rounded-[6px] transition-all duration-500" style={{ width: `${stage.pct}%`, background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
                    </div>
                    <div className="text-[12px] font-bold w-[38px] text-right">{stage.count}</div>
                    <div className="text-[11px] text-text-muted w-[32px] text-right">{stage.pct}%</div>
                  </div>
                ))}
              </div>
            )}
            {funnel && (
              <div className="mt-4 pt-3 border-t border-[rgba(91,76,245,0.08)] flex justify-between text-[12px]">
                <span className="text-text-muted">Общая конверсия лид → лечение</span>
                <span className="font-bold text-accent2">{funnel.overall_conversion}%</span>
              </div>
            )}
          </Card>

          {/* Lead sources */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="text-[14px] font-bold">Источники лидов</div>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Источник", "Лидов", "Конв.", "CPL", "Качество"].map((h) => (
                    <th key={h} className="text-left text-[10.5px] font-bold text-text-muted uppercase tracking-[0.8px] pb-[10px] px-[12px]" style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(funnel?.sources ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-text-muted text-[12px] py-6 px-3">Нет данных</td></tr>
                ) : (
                  (funnel?.sources ?? []).map((src) => (
                    <tr key={src.source} className="hover:bg-[rgba(91,76,245,0.03)]">
                      <td className="py-[10px] px-[12px] text-[13px] font-semibold">{src.source}</td>
                      <td className="py-[10px] px-[12px] text-[13px]">{src.leads}</td>
                      <td className="py-[10px] px-[12px] text-[13px] font-bold" style={{ color: src.conversion >= 50 ? "#00C9A7" : src.conversion < 30 ? "#F44B6E" : "#F5A623" }}>
                        {src.conversion}%
                      </td>
                      <td className="py-[10px] px-[12px] text-[13px] text-text-muted">{src.cpl ? `${src.cpl}₽` : "—"}</td>
                      <td className="py-[10px] px-[12px]">
                        <Pill variant={qualityVariant[src.quality] ?? "gray"}>{src.quality}</Pill>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </div>
      ) : (
        /* CRM view */
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
            <KanbanBoard pipeline={filteredPipeline} onMoveDeal={handleMoveDeal} onDealClick={setSelectedDeal} />
          ) : (
            /* Table view */
            <div className="rounded-[18px] overflow-hidden" style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 4px 20px rgba(120,140,180,0.12)" }}>
              <div className="grid grid-cols-[1fr_140px_120px_120px_100px] gap-3 px-[18px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
                {["Пациент / Сделка", "Услуга", "Врач", "Этап", "Сумма"].map((h) => (
                  <span key={h} className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider">{h}</span>
                ))}
              </div>
              {tableRows.length === 0 ? (
                <div className="text-center py-10 text-text-muted text-[13px]">Нет сделок</div>
              ) : tableRows.map((deal) => (
                <div key={deal.id} onClick={() => setSelectedDeal(deal)} className="grid grid-cols-[1fr_140px_120px_120px_100px] gap-3 px-[18px] py-[12px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors cursor-pointer">
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
                    {deal.amount ? `${deal.amount.toLocaleString("ru-RU")} ₽` : "—"}
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
      )}

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
