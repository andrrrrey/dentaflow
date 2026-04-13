import StatCard from "../components/ui/StatCard";
import Card from "../components/ui/Card";
import Pill from "../components/ui/Pill";
import { ClipboardList, AlertTriangle, CheckCircle } from "lucide-react";

/* ---------- types ---------- */

interface ScriptCheck {
  id: number;
  script: string;
  admin: string;
  compliance: number;
  errors: string[];
}

/* ---------- mock data ---------- */

const scriptChecks: ScriptCheck[] = [
  {
    id: 1,
    script: "Приветствие",
    admin: "Ольга Смирнова",
    compliance: 96,
    errors: [],
  },
  {
    id: 2,
    script: "Запись на приём",
    admin: "Мария Волкова",
    compliance: 82,
    errors: ["Не уточнила удобное время", "Не предложила альтернативу"],
  },
  {
    id: 3,
    script: "Работа с возражениями",
    admin: "Анна Кузнецова",
    compliance: 64,
    errors: ["Не использовала технику «Да, и...»", "Перебивала пациента", "Не предложила рассрочку"],
  },
  {
    id: 4,
    script: "Подтверждение записи",
    admin: "Елена Морозова",
    compliance: 88,
    errors: ["Не продублировала SMS"],
  },
  {
    id: 5,
    script: "Допродажа услуг",
    admin: "Ольга Смирнова",
    compliance: 75,
    errors: ["Не упомянула акцию", "Не рассказала про комплекс"],
  },
  {
    id: 6,
    script: "Работа с жалобами",
    admin: "Мария Волкова",
    compliance: 91,
    errors: [],
  },
  {
    id: 7,
    script: "Завершение звонка",
    admin: "Анна Кузнецова",
    compliance: 54,
    errors: ["Не подвела итог разговора", "Не уточнила контакт", "Не попрощалась по стандарту", "Не предложила обратную связь"],
  },
  {
    id: 8,
    script: "Напоминание о визите",
    admin: "Елена Морозова",
    compliance: 79,
    errors: ["Не назвала имя врача"],
  },
];

/* ---------- helpers ---------- */

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
  const avgCompliance = Math.round(
    scriptChecks.reduce((s, c) => s + c.compliance, 0) / scriptChecks.length,
  );
  const totalErrors = scriptChecks.reduce((s, c) => s + c.errors.length, 0);
  const perfectScripts = scriptChecks.filter((c) => c.errors.length === 0).length;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <StatCard
          label="Среднее соответствие"
          value={`${avgCompliance}%`}
          icon={<ClipboardList size={18} className="text-accent2" />}
          delta="+4% к прошлой неделе"
          deltaType="up"
        />
        <StatCard
          label="Всего ошибок"
          value={String(totalErrors)}
          icon={<AlertTriangle size={18} className="text-danger" />}
          delta="-3 к прошлой неделе"
          deltaType="up"
        />
        <StatCard
          label="Без ошибок"
          value={`${perfectScripts} из ${scriptChecks.length}`}
          icon={<CheckCircle size={18} className="text-accent3" />}
        />
      </div>

      {/* Table */}
      <Card>
        <h2 className="text-[15px] font-bold text-text-main mb-4">Контроль скриптов</h2>

        <div className="overflow-x-auto">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1fr_1fr_180px_1.5fr] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
            {(["Скрипт", "Администратор", "Соответствие %", "Ошибки"] as const).map((h) => (
              <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {scriptChecks.map((check) => (
            <div
              key={check.id}
              className="md:grid md:grid-cols-[1fr_1fr_180px_1.5fr] gap-3 px-[14px] py-[11px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors flex flex-col"
            >
              <span className="text-[13px] text-text-main font-bold">{check.script}</span>
              <span className="text-[13px] text-text-main">{check.admin}</span>
              {/* Compliance bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-[6px] rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${check.compliance}%`,
                      background: complianceColor(check.compliance),
                    }}
                  />
                </div>
                <span className="text-[12px] font-bold text-text-main w-[32px] text-right">
                  {check.compliance}%
                </span>
              </div>
              {/* Errors */}
              <div className="flex flex-wrap gap-1">
                {check.errors.length === 0 ? (
                  <Pill variant="green">Без ошибок</Pill>
                ) : (
                  check.errors.map((err, i) => (
                    <Pill key={i} variant={complianceVariant(check.compliance)}>
                      {err}
                    </Pill>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
