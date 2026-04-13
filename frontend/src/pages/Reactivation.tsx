import Card from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import Pill from "../components/ui/Pill";
import { RefreshCw, UserCheck, Users } from "lucide-react";

/* ---------- types ---------- */

interface InactivePatient {
  name: string;
  lastVisit: string;
  daysSince: number;
  reason: string;
  status: "pending" | "in_progress" | "reactivated" | "declined";
}

/* ---------- mock data ---------- */

const patients: InactivePatient[] = [
  { name: "Кузнецов Алексей В.", lastVisit: "12.01.2026", daysSince: 91, reason: "Не записался повторно", status: "pending" },
  { name: "Белова Татьяна С.", lastVisit: "05.12.2025", daysSince: 129, reason: "Переезд", status: "declined" },
  { name: "Орлов Сергей М.", lastVisit: "18.01.2026", daysSince: 85, reason: "Забыл записаться", status: "in_progress" },
  { name: "Фёдорова Елена А.", lastVisit: "22.11.2025", daysSince: 142, reason: "Финансовые причины", status: "pending" },
  { name: "Морозов Дмитрий И.", lastVisit: "03.01.2026", daysSince: 100, reason: "Нет жалоб", status: "reactivated" },
  { name: "Захарова Людмила К.", lastVisit: "14.12.2025", daysSince: 120, reason: "Плохой опыт", status: "pending" },
  { name: "Григорьев Олег Н.", lastVisit: "28.12.2025", daysSince: 106, reason: "Не записался повторно", status: "in_progress" },
  { name: "Попова Наталья В.", lastVisit: "09.11.2025", daysSince: 155, reason: "Сменила клинику", status: "declined" },
  { name: "Семёнов Павел Д.", lastVisit: "20.01.2026", daysSince: 83, reason: "Забыл записаться", status: "reactivated" },
  { name: "Андреева Екатерина Р.", lastVisit: "01.12.2025", daysSince: 133, reason: "Финансовые причины", status: "pending" },
];

const statusConfig: Record<InactivePatient["status"], { label: string; variant: "blue" | "green" | "yellow" | "red" | "purple" }> = {
  pending: { label: "Ожидает", variant: "blue" },
  in_progress: { label: "В работе", variant: "yellow" },
  reactivated: { label: "Реактивирован", variant: "green" },
  declined: { label: "Отказ", variant: "red" },
};

/* ---------- component ---------- */

export default function Reactivation() {
  const totalInactive = patients.length;
  const reactivated = patients.filter((p) => p.status === "reactivated").length;
  const inProgress = patients.filter((p) => p.status === "in_progress").length;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <StatCard
          label="Всего неактивных"
          value={String(totalInactive)}
          icon={<Users size={20} className="text-accent2" />}
          delta="+2 за неделю"
          deltaType="up"
        />
        <StatCard
          label="Успешно реактивировано"
          value={String(reactivated)}
          icon={<UserCheck size={20} className="text-accent3" />}
          delta="+1 сегодня"
          deltaType="up"
        />
        <StatCard
          label="В работе"
          value={String(inProgress)}
          icon={<RefreshCw size={20} className="text-yellow-500" />}
        />
      </div>

      {/* Patients table */}
      <Card>
        <h2 className="text-[15px] font-bold mb-4">Реактивация пациентов</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-text-muted font-semibold uppercase tracking-wider">
                <th className="pb-3 pr-4">Пациент</th>
                <th className="pb-3 pr-4">Последний визит</th>
                <th className="pb-3 pr-4">Дней без визита</th>
                <th className="pb-3 pr-4">Причина</th>
                <th className="pb-3 pr-4">Статус</th>
                <th className="pb-3">Действие</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((pt, i) => {
                const cfg = statusConfig[pt.status];
                return (
                  <tr
                    key={i}
                    className="border-t border-[rgba(91,76,245,0.06)] hover:bg-[rgba(91,76,245,0.03)] transition-colors"
                  >
                    <td className="py-[10px] pr-4 font-semibold">{pt.name}</td>
                    <td className="py-[10px] pr-4 text-text-muted">{pt.lastVisit}</td>
                    <td className="py-[10px] pr-4">
                      <span
                        className="font-bold"
                        style={{ color: pt.daysSince > 120 ? "#f44b6e" : pt.daysSince > 90 ? "#f5a623" : "#00c9a7" }}
                      >
                        {pt.daysSince}
                      </span>
                    </td>
                    <td className="py-[10px] pr-4 text-text-muted">{pt.reason}</td>
                    <td className="py-[10px] pr-4">
                      <Pill variant={cfg.variant}>{cfg.label}</Pill>
                    </td>
                    <td className="py-[10px]">
                      <div className="flex gap-2">
                        <button
                          className="px-3 py-[5px] text-[11px] font-semibold rounded-lg text-white transition-opacity hover:opacity-80"
                          style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
                        >
                          Позвонить
                        </button>
                        <button
                          className="px-3 py-[5px] text-[11px] font-semibold rounded-lg transition-opacity hover:opacity-80"
                          style={{
                            background: "rgba(91,76,245,0.08)",
                            color: "#5B4CF5",
                          }}
                        >
                          Написать
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
