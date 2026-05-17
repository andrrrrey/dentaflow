import { useRef, useState } from "react";
import StatCard from "../components/ui/StatCard";
import Card from "../components/ui/Card";
import Pill from "../components/ui/Pill";
import Button from "../components/ui/Button";
import { ClipboardList, Plus, X, Brain, GitCompare, Trash2, Loader2, CheckCircle, Phone, PhoneIncoming, PhoneOutgoing, Upload, FileText, Mic, AlertCircle } from "lucide-react";
import { useScripts, useCreateScript, useDeleteScript, useAnalyzeScript, useCompareCallWithScript, useUploadScript, useTranscribeCall } from "../api/scripts";
import type { ScriptAnalysis, CallComparison } from "../api/scripts";
import { useCalls } from "../api/calls";
import type { CallRecord } from "../api/calls";

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
  const uploadMutation = useUploadScript();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!name) { setError("Укажите название скрипта"); return; }
    if (inputMode === "file" && selectedFile) {
      try {
        await uploadMutation.mutateAsync({ name, category: category || undefined, file: selectedFile });
        onClose();
      } catch {
        setError("Ошибка при загрузке файла");
      }
    } else {
      if (!content) { setError("Введите текст скрипта или выберите файл"); return; }
      try {
        await createMutation.mutateAsync({ name, content, category: category || undefined });
        onClose();
      } catch {
        setError("Ошибка при сохранении");
      }
    }
  }

  const isPending = createMutation.isPending || uploadMutation.isPending;

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

          <div className="flex gap-2">
            <button
              onClick={() => setInputMode("text")}
              className="flex items-center gap-1 px-3 py-[6px] rounded-lg text-[12px] font-semibold transition-all border-none cursor-pointer"
              style={inputMode === "text" ? { background: "#5B4CF5", color: "#fff" } : { background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
            >
              <FileText size={13} />
              Текст
            </button>
            <button
              onClick={() => setInputMode("file")}
              className="flex items-center gap-1 px-3 py-[6px] rounded-lg text-[12px] font-semibold transition-all border-none cursor-pointer"
              style={inputMode === "file" ? { background: "#5B4CF5", color: "#fff" } : { background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
            >
              <Upload size={13} />
              Файл (.txt, .pdf, .docx)
            </button>
          </div>

          {inputMode === "text" ? (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Текст скрипта *</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none resize-none font-mono" style={inputStyle} placeholder="Здравствуйте! Стоматология «Улыбка», меня зовут [имя]. Чем могу помочь?..." />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept=".txt,.pdf,.docx,.doc"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] font-medium border-dashed border-2 border-[rgba(91,76,245,0.25)] text-text-muted hover:border-accent2 hover:text-accent2 transition-colors bg-transparent cursor-pointer"
              >
                <Upload size={16} />
                {selectedFile ? selectedFile.name : "Нажмите для выбора файла (.txt, .pdf, .docx)"}
              </button>
            </div>
          )}
        </div>
        {error && <div className="text-[12px] text-[#c52048] font-medium">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>Отмена</Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={isPending}>
            <Plus size={14} className="mr-1" />
            {isPending ? "Сохранение..." : "Сохранить скрипт"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -- Analysis Panel -- */

function AnalysisPanel({ scriptName, analysis, error }: { scriptName: string; analysis: ScriptAnalysis | null; error: string | null }) {
  if (error) {
    return (
      <div className="flex flex-col gap-2 p-4 rounded-xl" style={{ background: "rgba(244,75,110,0.05)", border: "1px solid rgba(244,75,110,0.15)" }}>
        <div className="flex items-center gap-2 text-[#c52048]">
          <AlertCircle size={15} />
          <span className="text-[13px] font-semibold">Ошибка анализа</span>
        </div>
        <p className="text-[12px] text-text-muted">{error}</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl h-full" style={{ background: "rgba(91,76,245,0.03)", border: "1px dashed rgba(91,76,245,0.15)" }}>
        <Brain size={32} className="text-accent2 opacity-30" />
        <p className="text-[13px] text-text-muted text-center">Выберите скрипт и нажмите «Анализ» для получения ИИ-оценки</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: "rgba(91,76,245,0.04)", border: "1px solid rgba(91,76,245,0.1)" }}>
      <div className="text-[13px] font-bold text-text-main">{scriptName}</div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-text-muted">Качество:</span>
          <span className="text-[18px] font-bold" style={{ color: complianceColor(analysis.score) }}>{analysis.score}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-text-muted">Полнота:</span>
          <span className="text-[18px] font-bold" style={{ color: complianceColor(analysis.completeness) }}>{analysis.completeness}%</span>
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
          <ul className="text-[12px] text-text-main list-disc list-inside flex flex-col gap-[2px]">
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
          <ul className="text-[12px] text-text-main list-disc list-inside flex flex-col gap-[2px]">
            {comparison.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCallDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
      + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function formatScriptDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return "—"; }
}

/* -- Component -- */

export default function ScriptsQC() {
  const { data, isLoading } = useScripts();
  const deleteMutation = useDeleteScript();
  const analyzeMutation = useAnalyzeScript();
  const compareMutation = useCompareCallWithScript();
  const transcribeMutation = useTranscribeCall();
  const [showAddModal, setShowAddModal] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<Record<string, ScriptAnalysis>>({});
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);

  const [compareScriptId, setCompareScriptId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [comparisonResult, setComparisonResult] = useState<CallComparison | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [transcribingCallId, setTranscribingCallId] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const { data: callsData } = useCalls({ days: 30, status: "answered" });
  const answeredCalls = (callsData?.calls ?? []).filter((c) => c.duration > 0);

  const scripts = data?.scripts ?? [];

  async function handleAnalyze(scriptId: string) {
    setAnalyzingId(scriptId);
    setSelectedScriptId(scriptId);
    setAnalysisErrors((prev) => { const n = { ...prev }; delete n[scriptId]; return n; });
    try {
      const result = await analyzeMutation.mutateAsync(scriptId);
      setAnalysisResults((prev) => ({ ...prev, [scriptId]: result.analysis }));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? "Ошибка при анализе скрипта";
      setAnalysisErrors((prev) => ({ ...prev, [scriptId]: msg }));
    }
    setAnalyzingId(null);
  }

  async function handleTranscribe(call: CallRecord) {
    setTranscribingCallId(call.call_id);
    setTranscribeError(null);
    try {
      const result = await transcribeMutation.mutateAsync(call.call_id);
      setTranscript(result.transcript);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? "Не удалось расшифровать звонок";
      setTranscribeError(msg);
    } finally {
      setTranscribingCallId(null);
    }
  }

  async function handleCompare() {
    if (!compareScriptId || !transcript.trim()) return;
    setCompareError(null);
    setComparisonResult(null);
    try {
      const result = await compareMutation.mutateAsync({ script_id: compareScriptId, transcript: transcript.trim() });
      setComparisonResult(result.comparison);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? "Ошибка при сравнении";
      setCompareError(msg);
    }
  }

  const selectedScript = scripts.find((s) => s.id === selectedScriptId) ?? null;

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

      {/* Scripts table + AI analysis panel */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-text-main">Скрипты звонков</h2>
          <div className="flex gap-2">
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
          <div className="flex gap-4">
            {/* Scripts table */}
            <div className="flex-1 min-w-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-[11px] font-bold text-text-muted uppercase tracking-wider pb-2 pr-3">Название</th>
                    <th className="text-left text-[11px] font-bold text-text-muted uppercase tracking-wider pb-2 pr-3">Категория</th>
                    <th className="text-left text-[11px] font-bold text-text-muted uppercase tracking-wider pb-2 pr-3">Дата</th>
                    <th className="text-right text-[11px] font-bold text-text-muted uppercase tracking-wider pb-2">Оценка</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {scripts.map((script) => {
                    const isSelected = selectedScriptId === script.id;
                    const score = analysisResults[script.id]?.score;
                    return (
                      <tr
                        key={script.id}
                        onClick={() => setSelectedScriptId(script.id)}
                        className="cursor-pointer transition-colors"
                        style={isSelected ? { background: "rgba(91,76,245,0.06)" } : {}}
                      >
                        <td className="py-[10px] pr-3 rounded-l-xl">
                          <span className="text-[13px] font-semibold text-text-main">{script.name}</span>
                        </td>
                        <td className="py-[10px] pr-3">
                          <span className="text-[12px] text-text-muted">{script.category || "—"}</span>
                        </td>
                        <td className="py-[10px] pr-3">
                          <span className="text-[12px] text-text-muted">{formatScriptDate(script.created_at)}</span>
                        </td>
                        <td className="py-[10px] pr-3 text-right">
                          {score !== undefined ? (
                            <span className="text-[13px] font-bold" style={{ color: complianceColor(score) }}>{score}%</span>
                          ) : (
                            <span className="text-[12px] text-text-muted">—</span>
                          )}
                        </td>
                        <td className="py-[10px] rounded-r-xl">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAnalyze(script.id); }}
                              disabled={analyzingId === script.id}
                              title="Анализ ИИ"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-accent2 hover:bg-[rgba(91,76,245,0.08)] transition-colors border-none cursor-pointer bg-transparent disabled:opacity-50"
                            >
                              {analyzingId === script.id ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                              Анализ
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(script.id); }}
                              title="Удалить"
                              className="p-1 rounded-lg text-text-muted hover:text-[#f44b6e] hover:bg-[rgba(244,75,110,0.08)] transition-colors border-none cursor-pointer bg-transparent"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* AI Analysis panel */}
            <div className="w-[340px] flex-shrink-0">
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">ИИ-анализ скрипта</div>
              <AnalysisPanel
                scriptName={selectedScript?.name ?? ""}
                analysis={selectedScriptId ? (analysisResults[selectedScriptId] ?? null) : null}
                error={selectedScriptId ? (analysisErrors[selectedScriptId] ?? null) : null}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Answered calls for transcription */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-text-main flex items-center gap-2">
            <Phone size={16} className="text-accent3" />
            Отвеченные звонки (Новофон)
          </h2>
          <span className="text-[12px] text-text-muted">{answeredCalls.length} за 30 дней</span>
        </div>
        {transcribeError && (
          <div className="mb-3 px-4 py-3 rounded-xl text-[12px] text-[#c52048] flex flex-col gap-1" style={{ background: "rgba(197,32,72,0.07)", border: "1px solid rgba(197,32,72,0.15)" }}>
            <span className="font-bold">Ошибка расшифровки:</span>
            <span>{transcribeError}</span>
            <span className="text-text-muted mt-1">
              Вы можете вставить расшифровку вручную в секцию «Сравнение звонка со скриптом» ниже.
            </span>
          </div>
        )}
        {answeredCalls.length === 0 ? (
          <div className="text-center text-text-muted py-8 text-[13px]">
            Нет отвеченных звонков с записью за последние 30 дней
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {answeredCalls.slice(0, 30).map((call) => (
              <div key={call.call_id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(91,76,245,0.08)" }}>
                <div className="flex-shrink-0">
                  {call.direction === "outbound"
                    ? <PhoneOutgoing size={15} className="text-accent2" />
                    : <PhoneIncoming size={15} className="text-accent3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-text-main">
                    {call.direction === "inbound" ? call.caller_id : call.called_did}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {formatCallDate(call.started_at)} · {formatDuration(call.duration)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleTranscribe(call); }}
                  disabled={transcribingCallId !== null}
                  className="flex items-center gap-1 px-3 py-[6px] rounded-lg text-[12px] font-semibold transition-all border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: transcribingCallId === call.call_id ? "rgba(91,76,245,0.15)" : "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
                >
                  {transcribingCallId === call.call_id
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Mic size={12} />}
                  <span>{transcribingCallId === call.call_id ? "Расшифровка..." : "Расшифровать"}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Compare with call */}
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
              placeholder="Вставьте расшифровку звонка или нажмите «Расшифровать» у звонка выше..."
            />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="md" onClick={handleCompare} disabled={compareMutation.isPending || !compareScriptId || !transcript.trim()}>
              {compareMutation.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <GitCompare size={14} className="mr-1" />}
              {compareMutation.isPending ? "Анализ..." : "Сравнить со скриптом"}
            </Button>
          </div>

          {compareError && (
            <div className="px-4 py-3 rounded-xl text-[12px] text-[#c52048] flex items-start gap-2" style={{ background: "rgba(197,32,72,0.07)", border: "1px solid rgba(197,32,72,0.15)" }}>
              <AlertCircle size={14} className="mt-[1px] flex-shrink-0" />
              <span>{compareError}</span>
            </div>
          )}

          {comparisonResult && <ComparisonResult comparison={comparisonResult} />}
        </div>
      </Card>

      {showAddModal && <AddScriptModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
