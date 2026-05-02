import { Sparkles, RefreshCw } from "lucide-react";
import type { AIInsights } from "../../types";

interface AIInsightBannerProps {
  insights: AIInsights;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function AIInsightBanner({ insights, onRefresh, isRefreshing }: AIInsightBannerProps) {
  return (
    <div
      className="rounded-glass p-[20px_22px] relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #6c5ce7 0%, #3b7fed 60%, #00c9a7 100%)",
        boxShadow: "0 4px 24px rgba(91,76,245,0.18)",
      }}
    >
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-white" />
            <span className="text-[11px] font-bold tracking-wider text-white/80 uppercase">
              ИИ-Ассистент
            </span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-white/80 hover:text-white hover:bg-white/15 transition-all border border-white/20 bg-transparent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Обновить совет"
            >
              <RefreshCw size={11} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "Обновляю..." : "Обновить"}
            </button>
          )}
        </div>

        <p className="text-[14px] text-white font-semibold leading-relaxed" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.25)" }}>
          {isRefreshing ? "Анализирую показатели клиники..." : insights.summary}
        </p>
      </div>
    </div>
  );
}
