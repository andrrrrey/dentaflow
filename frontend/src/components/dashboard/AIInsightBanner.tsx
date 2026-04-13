import { Sparkles } from "lucide-react";
import type { AIInsights, AIChip } from "../../types";

interface AIInsightBannerProps {
  insights: AIInsights;
}

const chipColors: Record<AIChip["type"], string> = {
  ok: "bg-[rgba(0,201,167,0.18)] text-[#007d6e]",
  warn: "bg-[rgba(245,166,35,0.18)] text-[#b87200]",
  danger: "bg-[rgba(244,75,110,0.18)] text-[#c52048]",
  blue: "bg-[rgba(59,127,237,0.18)] text-[#1a55b0]",
};

export default function AIInsightBanner({ insights }: AIInsightBannerProps) {
  return (
    <div
      className="rounded-glass p-[20px_22px] relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #6c5ce7 0%, #3b7fed 60%, #00c9a7 100%)",
        boxShadow: "0 4px 24px rgba(91,76,245,0.18)",
      }}
    >
      {/* Background glow decoration */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-white" />
          <span className="text-[11px] font-bold tracking-wider text-white/80 uppercase">
            ИИ-Ассистент
          </span>
        </div>

        {/* Summary */}
        <p className="text-sm text-white font-medium leading-relaxed mb-3">
          {insights.summary}
        </p>

        {/* Chips */}
        <div className="flex flex-wrap gap-2">
          {insights.chips.map((chip, i) => (
            <span
              key={i}
              className={`inline-block px-[10px] py-[4px] rounded-full text-[11px] font-semibold ${chipColors[chip.type as AIChip["type"]] ?? chipColors.blue}`}
            >
              {chip.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
