import { useState } from "react";
import StatCard from "../components/ui/StatCard";
import Card from "../components/ui/Card";
import Pill from "../components/ui/Pill";
import Button from "../components/ui/Button";
import { ClipboardList, Plus, X, Brain, GitCompare, Trash2, Loader2, CheckCircle } from "lucide-react";
import { useScripts, useCreateScript, useDeleteScript, useAnalyzeScript, useCompareCallWithScript } from "../api/scripts";
import type { ScriptAnalysis, CallComparison } from "../api/scripts";

/* -- Helpers -- */

function complianceColor(pct: number): string {
  if (pct >= 80) return "#00c9a7";
  if (pct >= 60) return "#f5a623";
  return "#f44b6e";
}

const inputStyle = {
  border: "1px solid rgba(91,76,245,0.15)",
  background: "rgba(255,255,255,0.5)",
};

/* -- Add Script Modal -- */

function AddScriptModal({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateScript();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!name || !content) {
      setError("Укажите название и текст скрипта");
      return;
    }
    try {
      await createMutation.mutateAsync({ name, content, category: category || undefined });
      onClose();
    } catch {
      setError("Ошибка при сохранении");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-[560px] rounded-[20px] p-6 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(91,76,245,0.15)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">Загрузить скрипт</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Название *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Приветствие" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Категория</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none" style={inputStyle} placeholder="Входящий звонок" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Текст скрипта *</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none resize-none font-mono" style={inputStyle} placeholder="Здравствуйте! Стоматология «Улыбка», меня зовут [имя]. Чем могу помочь?..." />
          </div>
        </div>
        {error && <div className="text-[12px] text-[#c52048] font-medium">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Отмена</Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={createMutation.isPending}>
            <Plus size={14} className="mr-1" />
            {createMutation.isPending ? "Сохранение..." : "Сохранить скрипт"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -- Analysis Result -- */

function AnalysisResult({ analysis }: { analysis: ScriptAnalysis }) {
  return (
    <div className="flex flex-col gap-3 mt-3 p-4 rounded-xl" style={{ background: "rgba(91,76,245,0.04)", border: "1px solid rgba(91,76,245,0.1)" }}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-text-muted">Качество:</span>
          <span className="text-[16px] font-bold" style={{ color: complianceColor(analysis.score) }}>{analysis.score}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-text-muted">Полнота:</span>
          <span className="text-[16px] font-bold" style={{ color: complianceColor(analysis.completeness) }}>{analysis.completeness}%</span>
        </div>
      </div>
      {analysis.strengths.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-text-muted uppercase mb-1">Сильные стороны</div>
          <div className="flex flex-wrap gap-1">
            {analysis.strengths.map((s, i) => <Pill key={i} variant="green">{s}</Pill>)}
          </div>
        </div>
      )}
      {analysis.weaknesses.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-text-muted uppercase mb-1">Слабые места</div>
          <div className="flex flex-wrap gap-1">
            {analysis.weaknesses.map((s, i) => <Pill key={i} variant="yellow">{s}</Pill>)}
          </div>
        </div>
      )}
      {analysis.recommendations.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-text-muted uppercase mb-1">Рекомендации</div>
          <ul className="text-[12px] text-text-main list-disc list-inside">
            {analysis.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -- Comparison Result -- */

function ComparisonResult({ comparison }: { comparison: CallComparison }) {
  return (
    <div className="flex flex-col gap-3 mt-3 p-4 rounded-xl" style={{ background: "rgba(91,76,245,0.04)", border: "1px solid rgba(91,76,245,0.1)" }}>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted">Соответствие скрипту:</span>
        <span className="text-[18px] font-bold" style={{ color: complianceColor(comparison.compliance_pct) }}>{comparison.compliance_pct}%</span>
      </div>
      {comparison.completed_steps.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-text-muted uppercase mb-1">Выполненные этапы</div>
          <div className="flex flex-wrap gap-1">
            {comparison.completed_steps.map((s, i) => <Pill key={i} variant="green">{s}</Pill>)}
          </div>
        </div>
      )}
      {comparison.missed_steps.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-text-muted uppercase mb-1">Пропущенные этапы</div>
          <div className="flex flex-wrap gap-1">
            {comparison.missed_steps.map((s, i) => <Pill key={i} variant="red">{s}</Pill>)}
          </div>
        </div>
      )}
      {comparison.deviations.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-text-muted uppercase mb-1">Отклонения</div>
          <div className="flex flex-wrap gap-1">
            {comparison.deviations.map((s, i) => <Pill key={i} variant="yellow">{s}</Pill>)}
          </div>
        </div>
      )}
      {comparison.recommendations.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-text-muted uppercase mb-1">Рекомендации</div>
          <ul className="text-[12px] text-text-main list-disc list-inside">
            {comparison.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -- Component -- */

export default function ScriptsQC() {
  const { data, isLoading } = useScripts();
  const deleteMutation = useDeleteScript();
  const analyzeMutation = useAnalyzeScript();
  const compareMutation = useCompareCallWithScript();

  const [showAddModal, setShowAddModal] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<Record<string, ScriptAnalysis>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const [showCompare, setShowCompare] = useState(false);
  const [compareScriptId, setCompareScriptId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [comparisonResult, setComparisonResult] = useState<CallComparison | null>(null);

  const scripts = data?.scripts ?? [];

  async function handleAnalyze(scriptId: string) {
    setAnalyzingId(scriptId);
    try {
      const result = await analyzeMutation.mutateAsync(scriptId);
      setAnalysisResults((prev) => ({ ...prev, [scriptId]: result.analysis }));
    } catch { /* ignore */ }
    setAnalyzingId(null);
  }

  async function handleCompare() {
    if (!compareScriptId || !transcript.trim()) return;
    try {
      const result = await compareMutation.mutateAsync({ script_id: compareScriptId, transcript: transcript.trim() });
      setComparisonResult(result.comparison);
    } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <StatCard
          label="Всего скриптов"
          value={String(scripts.length)}
          icon={<ClipboardList size={18} className="text-accent2" />}
        />
        <StatCard
          label="Проанализировано"
          value={String(Object.keys(analysisResults).length)}
          icon={<Brain size={18} className="text-accent3" />}
        />
        <StatCard
          label="Средняя оценка"
          value={Object.keys(analysisResults).length > 0
            ? `${Math.round(Object.values(analysisResults).reduce((s, a) => s + a.score, 0) / Object.keys(analysisResults).length)}%`
            : "—"}
          icon={<CheckCircle size={18} className="text-accent2" />}
        />
      </div>

      {/* Scripts list */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-text-main">Скрипты звонков</h2>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowCompare(!showCompare)}>
              <GitCompare size={13} className="mr-1" />
              Сравнить с звонком
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
              <Plus size={13} className="mr-1" />
              Загрузить скрипт
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-text-muted py-12 text-[13px]">Загрузка...</div>
        ) : scripts.length === 0 ? (
          <div className="text-center text-text-muted py-12 text-[13px]">
            Нет загруженных скриптов. Нажмите «Загрузить скрипт» чтобы добавить первый.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {scripts.map((script) => (
              <div key={script.id} className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(91,76,245,0.08)" }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-[14px] font-bold text-text-main">{script.name}</div>
                    {script.category && <span className="text-[11px] text-text-muted">{script.category}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {analysisResults[script.id] && (
                      <span className="text-[12px] font-bold" style={{ color: complianceColor(analysisResults[script.id].score) }}>
                        {analysisResults[script.id].score}%
                      </span>
                    )}
                    <button
                      onClick={() => handleAnalyze(script.id)}
                      disabled={analyzingId === script.id}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-accent2 hover:bg-[rgba(91,76,245,0.08)] transition-colors border-none cursor-pointer bg-transparent"
                    >
                      {analyzingId === script.id ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                      Анализ
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(script.id)}
                      className="p-1 rounded-lg text-text-muted hover:text-[#f44b6e] hover:bg-[rgba(244,75,110,0.08)] transition-colors border-none cursor-pointer bg-transparent"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <pre className="text-[12px] text-text-muted whitespace-pre-wrap max-h-[120px] overflow-y-auto font-mono leading-relaxed">
                  {script.content.length > 400 ? script.content.slice(0, 400) + "..." : script.content}
                </pre>

                {analysisResults[script.id] && <AnalysisResult analysis={analysisResults[script.id]} />}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Compare with call section */}
      {showCompare && (
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">
            <GitCompare size={16} className="inline mr-2 text-accent2" />
            Сравнение звонка со скриптом
          </h2>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Скрипт для сравнения</label>
              <select
                value={compareScriptId}
                onChange={(e) => setCompareScriptId(e.target.value)}
                className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer"
                style={inputStyle}
              >
                <option value="">Выберите скрипт</option>
                {scripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Расшифровка звонка</label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={8}
                className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none resize-none font-mono"
                style={inputStyle}
                placeholder="Вставьте расшифровку звонка..."
              />
            </div>
            <div className="flex justify-end">
              <Button variant="primary" size="md" onClick={handleCompare} disabled={compareMutation.isPending || !compareScriptId || !transcript.trim()}>
                {compareMutation.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <GitCompare size={14} className="mr-1" />}
                {compareMutation.isPending ? "Анализ..." : "Сравнить"}
              </Button>
            </div>

            {comparisonResult && <ComparisonResult comparison={comparisonResult} />}
          </div>
        </Card>
      )}

      {/* Add script modal */}
      {showAddModal && <AddScriptModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
