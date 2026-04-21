import Card from "../ui/Card";
import type { DoctorLoad } from "../../types";

interface DoctorsLoadProps {
  doctors: DoctorLoad[];
}

function barColor(pct: number): string {
  if (pct > 85) return "#f44b6e";
  if (pct > 70) return "#f5a623";
  return "#00c9a7";
}

export default function DoctorsLoad({ doctors }: DoctorsLoadProps) {
  return (
    <Card>
      <h3 className="text-sm font-extrabold mb-4">Загрузка врачей</h3>

      <div className="flex flex-col gap-[12px]">
        {doctors.map((d) => (
          <div key={d.name}>
            <div className="flex items-center justify-between mb-[4px]">
              <div>
                <span className="text-[13px] font-semibold">{d.name}</span>
                <span className="text-[11px] text-text-muted ml-2">
                  {d.spec}
                </span>
              </div>
              <span
                className="text-[12px] font-bold"
                style={{ color: barColor(d.load_pct) }}
              >
                {d.load_pct}%
              </span>
            </div>
            <div className="h-[6px] rounded-full bg-[rgba(0,0,0,0.05)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${d.load_pct}%`,
                  backgroundColor: barColor(d.load_pct),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
