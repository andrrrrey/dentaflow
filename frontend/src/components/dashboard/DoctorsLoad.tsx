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

      {doctors.length === 0 ? (
        <div className="text-[13px] text-text-muted text-center py-4">
          Нет данных о приёмах
        </div>
      ) : (
        <div className="flex flex-col gap-[14px]">
          {doctors.map((d) => (
            <div key={d.name}>
              <div className="flex items-center justify-between mb-[5px]">
                <div className="min-w-0 flex-1 mr-3">
                  <span className="text-[13px] font-semibold text-text-main truncate block">
                    {d.name}
                  </span>
                </div>
                <span className="text-[12px] font-bold text-text-main flex-shrink-0">
                  {d.spec}
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
      )}
    </Card>
  );
}
