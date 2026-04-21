import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Briefcase, Stethoscope } from "lucide-react";
import Pill from "../ui/Pill";
import type { DealBrief } from "../../api/patients";

interface DealsHistoryProps {
  deals: DealBrief[];
}

const stageMap: Record<string, { variant: "blue" | "green" | "yellow" | "red" | "purple"; label: string }> = {
  new: { variant: "blue", label: "Новая" },
  contact: { variant: "blue", label: "Контакт" },
  negotiation: { variant: "yellow", label: "Переговоры" },
  scheduled: { variant: "purple", label: "Записан" },
  treatment: { variant: "yellow", label: "Лечение" },
  closed_won: { variant: "green", label: "Закрыто (успех)" },
  closed_lost: { variant: "red", label: "Закрыто (потеря)" },
};

function formatAmount(v: number | null): string {
  if (v === null) return "---";
  return v.toLocaleString("ru-RU") + " \u20BD";
}

export default function DealsHistory({ deals }: DealsHistoryProps) {
  const sorted = [...deals].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="space-y-3">
      {sorted.map((deal) => {
        const st = stageMap[deal.stage] ?? { variant: "blue" as const, label: deal.stage };
        return (
          <div
            key={deal.id}
            className="rounded-glass p-[16px_18px]"
            style={{
              background: "rgba(255,255,255,0.65)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Icon */}
              <div className="flex-shrink-0">
                <div
                  className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center"
                  style={{ background: "rgba(91,76,245,0.08)" }}
                >
                  <Briefcase size={16} className="text-[#5B4CF5]" />
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-text-main truncate">
                  {deal.title}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[12px] text-text-muted">
                  {deal.service && (
                    <span>{deal.service}</span>
                  )}
                  {deal.doctor_name && (
                    <span className="flex items-center gap-1">
                      <Stethoscope size={12} />
                      {deal.doctor_name}
                    </span>
                  )}
                </div>
              </div>

              {/* Stage + amount */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <Pill variant={st.variant}>{st.label}</Pill>
                <span className="text-[13px] font-bold text-text-main min-w-[90px] text-right">
                  {formatAmount(deal.amount)}
                </span>
              </div>
            </div>

            {/* Timeline / dates */}
            <div className="flex items-center gap-4 mt-2 text-[10px] text-text-muted pl-[48px]">
              <span>
                Создано: {format(new Date(deal.created_at), "dd MMM yyyy", { locale: ru })}
              </span>
              <span>
                Обновлено: {format(new Date(deal.stage_changed_at), "dd MMM yyyy", { locale: ru })}
              </span>
            </div>
          </div>
        );
      })}

      {sorted.length === 0 && (
        <div className="text-center py-8 text-text-muted text-[13px]">
          Нет сделок
        </div>
      )}
    </div>
  );
}
