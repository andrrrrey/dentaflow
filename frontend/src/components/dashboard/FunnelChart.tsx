import Card from "../ui/Card";
import type { FunnelItem } from "../../types";

interface FunnelChartProps {
  funnel: FunnelItem[];
}

export default function FunnelChart({ funnel }: FunnelChartProps) {
  return (
    <Card>
      <h3 className="text-sm font-extrabold mb-4">Воронка пациентов</h3>

      <div className="flex flex-col gap-[10px]">
        {funnel.map((item) => (
          <div key={item.stage}>
            <div className="flex items-center justify-between mb-[4px]">
              <span className="text-[12px] font-medium text-text-main">
                {item.stage}
              </span>
              <span className="text-[12px] font-semibold text-text-muted">
                {item.count}{" "}
                <span className="text-[11px] text-text-muted/60">
                  ({item.pct}%)
                </span>
              </span>
            </div>
            <div className="h-[8px] rounded-full bg-[rgba(91,76,245,0.08)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${item.pct}%`,
                  background:
                    "linear-gradient(90deg, #6c5ce7 0%, #3b7fed 100%)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
