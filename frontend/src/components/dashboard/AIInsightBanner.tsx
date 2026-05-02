import { Sparkles } from "lucide-react";
import type { AIInsights } from "../../types";

interface AIInsightBannerProps {
  insights: AIInsights;
}

export default function AIInsightBanner({ insights }: AIInsightBannerProps) {
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
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-white" />
          <span className="text-[11px] font-bold tracking-wider text-white/80 uppercase">
            ИИ-Ассистент
          </span>
        </div>

        <p className="text-[14px] text-white font-semibold leading-relaxed" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.25)" }}>
          {insights.summary}
        </p>
      </div>
    </div>
  );
}
