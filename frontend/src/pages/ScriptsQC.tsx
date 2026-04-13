import Card from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import Pill from "../components/ui/Pill";
import { ClipboardList, CheckCircle, AlertTriangle } from "lucide-react";

/* ---------- types ---------- */

interface ScriptCheck {
  script: string;
  admin: string;
  compliance: number;
  errors: string[];
}

/* ---------- mock data ---------- */

const checks: ScriptCheck[] = [
  {
    script: "Приветствие",
    admin: "Ольга Смирнова",
    compliance: 96,
    errors: [],
  },
  {
    script: "Запись на приём",
    admin: "Мария Волкова",
    compliance: 82,
    errors: ["Не уточнила удобное время"],
  },
  {
    script: "Работа с возражениями",
    admin: "Анна Кузнецова",
    compliance: 58,
    errors: ["Не использовала скрипт обработки цены", "Перебила пациента"],
  },
  {
    script: "Подтверждение записи",
    admin: "Елена Морозова",
    compliance: 91,
    errors: [],
  },
  {
    script: "Перенос / отмена записи",
    admin: "Ольга Смирнова",
    compliance: 74,
    errors: ["Не предложила альтернативную дату"],
  },
  {
    script: "Допродажа услуг",
    admin: "Мария Волкова",
    compliance: 45,
    errors: ["Не упомянула акцию", "Не предложила комплекс", "Завершила звонок слишком быстро"],
  },
  {
    script: "Обратная связь после визита",
    admin: "Анна Кузнецова",
    compliance: 88,
    errors: ["Не уточнила удовлетворённость"],
  },
  {
    script: "Реактивация (исходящий)",
    admin: "Елена Морозова",
    compliance: 67,
    errors: ["Не использовала персональное обращение", "Не назвала причину звонка"],
  },
];

function complianceColor(pct: number): string {
  if (pct >= 80) return "#00c9a7";
  if (pct >= 60) return "#f5a623";
  return "#f44b6e";
}

function complianceVariant(pct: number): "green" | "yellow" | "red" {
  if (pct >= 80) return "green";
  if (pct >= 60) return "yellow";
  return "red";
}

/* ---------- component ---------- */

export default function ScriptsQC() {
  const avgCompliance = Math.round(checks.reduce((s, c) => s + c.compliance, 0) / checks.length);
  const totalChecks = checks.length;
  const criticalErrors = checks.filter((c) => c.compliance < 60).length;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <StatCard
          label="Среднее соответствие"
          value={`${avgCompliance}%`}
          icon={<ClipboardList size={20} className="text-accent2" />}
          delta="+4% к пр. месяцу"
          deltaType="up"
        />
        <StatCard
          label="Всего проверок"
          value={String(totalChecks)}
          icon={<CheckCircle size={20} className="text-accent3" />}
        />
        <StatCard
          label="Критических отклонений"
          value={String(criticalErrors)}
          icon={<AlertTriangle size={20} className="text-danger" />}
        />
      </div>

      {/* Scripts table */}
      <Card>
        <h2 className="text-[15px] font-bold mb-4">Контроль скриптов</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-text-muted font-semibold uppercase tracking-wider">
                <th className="pb-3 pr-4">Скрипт</th>
                <th className="pb-3 pr-4">Администратор</th>
                <th className="pb-3 pr-4">Соответствие %</th>
                <th className="pb-3">Ошибки</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check, i) => (
                <tr
                  key={i}
                  className="border-t border-[rgba(91,76,245,0.06)] hover:bg-[rgba(91,76,245,0.03)] transition-colors"
                >
                  <td className="py-[10px] pr-4 font-semibold">{check.script}</td>
                  <td className="py-[10px] pr-4">{check.admin}</td>
                  <td className="py-[10px] pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-[80px] h-[6px] rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${check.compliance}%`,
                            backgroundColor: complianceColor(check.compliance),
                          }}
                        />
                      </div>
                      <span className="font-semibold text-[12px]">{check.compliance}%</span>
                    </div>
                  </td>
                  <td className="py-[10px]">
                    {check.errors.length === 0 ? (
                      <Pill variant="green">Без ошибок</Pill>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {check.errors.map((err, j) => (
                          <span key={j} className="text-[11px] text-text-muted">
                            <Pill variant={complianceVariant(check.compliance)} className="mr-1">!</Pill>
                            {err}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
