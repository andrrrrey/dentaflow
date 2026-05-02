import { useState } from "react";
import {
  Sparkles,
  ShieldAlert,
  Target,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import type { AIAnalysis as AIAnalysisType } from "../../api/patients";
import { useAnalyzePatient, type PatientAiAnalysis } from "../../api/ai";

interface AIAnalysisProps {
  analysis: AIAnalysisType;
  patientId?: string;
}

export default function AIAnalysis({ analysis, patientId }: AIAnalysisProps) {
  const [liveAnalysis, setLiveAnalysis] = useState<PatientAiAnalysis | null>(null);
  const analyzeMutation = useAnalyzePatient();

  const displayed = liveAnalysis ?? analysis;
  const prob = displayed.return_probability;

  // Color based on probability
  let barColor = "#00C9A7"; // green
  if (prob < 40) barColor = "#F44B6E";
  else if (prob < 70) barColor = "#F5A623";

  return (
    <div
      className="rounded-glass p-[20px_22px] relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #6c5ce7 0%, #3b7fed 60%, #00c9a7 100%)",
        boxShadow: "0 4px 24px rgba(91,76,245,0.18)",
      }}
    >
      {/* Background glow */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-white" />
          <span className="text-[11px] font-bold tracking-wider text-white/80 uppercase flex-1">
            ИИ-Анализ пациента
          </span>
          {patientId && (
            <button
              onClick={() =>
                analyzeMutation.mutate(patientId, {
                  onSuccess: (data) => setLiveAnalysis(data),
                })
              }
              disabled={analyzeMutation.isPending}
              className="flex items-center gap-1 px-[8px] py-[3px] rounded-full text-[10px] font-semibold border border-white/30 bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50"
              title="Сгенерировать анализ"
            >
              <RefreshCw size={10} className={analyzeMutation.isPending ? "animate-spin" : ""} />
              {analyzeMutation.isPending ? "..." : "Обновить"}
            </button>
          )}
        </div>

        {/* Return probability */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-semibold text-white/80 flex items-center gap-1.5">
              <TrendingUp size={14} />
              Вероятность возврата
            </span>
            <span className="text-[16px] font-extrabold text-white">
              {prob ?? 0}%
            </span>
          </div>
          <div className="w-full h-[6px] rounded-full bg-white/20">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${prob}%`,
                background: barColor,
                boxShadow: `0 0 8px ${barColor}80`,
              }}
            />
          </div>
        </div>

        {/* Barriers */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldAlert size={14} className="text-white/80" />
            <span className="text-[12px] font-semibold text-white/80">
              Барьеры
            </span>
          </div>
          <div className="space-y-1.5">
            {(displayed.barriers ?? []).map((barrier, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-[6px] rounded-[10px]"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <span className="w-[5px] h-[5px] rounded-full bg-white/60 flex-shrink-0" />
                <span className="text-[12px] text-white font-medium">
                  {barrier}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Next action */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={14} className="text-white/80" />
            <span className="text-[12px] font-semibold text-white/80">
              Рекомендация
            </span>
          </div>
          <div
            className="px-3 py-[8px] rounded-[10px] text-[12px] text-white font-medium leading-relaxed"
            style={{ background: "rgba(255,255,255,0.12)" }}
          >
            {displayed.next_action}
          </div>
        </div>

        {/* Summary */}
        <p className="text-[12px] text-white/80 leading-relaxed">
          {displayed.summary}
        </p>
      </div>
    </div>
  );
}
