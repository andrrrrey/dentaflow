import StatCard from "../components/ui/StatCard";
import Pill from "../components/ui/Pill";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { RefreshCw, UserCheck, Clock, Phone, MessageSquare } from "lucide-react";

/* ---------- types ---------- */

interface InactivePatient {
  id: number;
  name: string;
  lastVisit: string;
  daysInactive: number;
  reason: string;
  status: "pending" | "in_progress" | "success" | "failed";
}

/* ---------- mock data ---------- */

const patients: InactivePatient[] = [
  { id: 1, name: "Григорьев Антон", lastVisit: "15.12.2025", daysInactive: 119, reason: "Не завершил лечение", status: "pending" },
  { id: 2, name: "Белова Светлана", lastVisit: "02.01.2026", daysInactive: 101, reason: "Пропустила профосмотр", status: "in_progress" },
  { id: 3, name: "Орлов Владимир", lastVisit: "10.11.2025", daysInactive: 154, reason: "Не записался на продолжение", status: "pending" },
  { id: 4, name: "Семёнова Наталья", lastVisit: "28.12.2025", daysInactive: 106, reason: "Откладывает протезирование", status: "success" },
  { id: 5, name: "Титов Максим", lastVisit: "05.10.2025", daysInactive: 190, reason: "Ушёл к конкуренту", status: "failed" },
  { id: 6, name: "Кравцова Екатерина", lastVisit: "20.01.2026", daysInactive: 83, reason: "Не закончила ортодонтию", status: "in_progress" },
  { id: 7, name: "Жуков Артём", lastVisit: "15.09.2025", daysInactive: 210, reason: "Нет контакта", status: "pending" },
  { id: 8, name: "Данилова Юлия", lastVisit: "08.12.2025", daysInactive: 126, reason: "Финансовые трудности", status: "in_progress" },
  { id: 9, name: "Поляков Роман", lastVisit: "22.11.2025", daysInactive: 142, reason: "Забыл про приём", status: "pending" },
  { id: 10, name: "Филатова Алина", lastVisit: "03.01.2026", daysInactive: 100, reason: "Переехала", status: "pending" },
];

/* ---------- helpers ---------- */

const statusConfig: Record<InactivePatient["status"], { label: string; variant: "blue" | "yellow" | "green" | "red" }> = {
  pending: { label: "Ожидает", variant: "blue" },
  in_progress: { label: "В работе", variant: "yellow" },
  success: { label: "Реактивирован", variant: "green" },
  failed: { label: "Отказ", variant: "red" },
};

/* ---------- component ---------- */

export default function Reactivation() {
  const totalInactive = patients.length;
  const reactivated = patients.filter((p) => p.status === "success").length;
  const inProgress = patients.filter((p) => p.status === "in_progress").length;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <StatCard
          label="Всего неактивных"
          value={String(totalInactive)}
          icon={<RefreshCw size={18} className="text-accent2" />}
          delta="+2 за неделю"
          deltaType="down"
        />
        <StatCard
          label="Успешно реактивировано"
          value={String(reactivated)}
          icon={<UserCheck size={18} className="text-accent3" />}
          delta="+1 за неделю"
          deltaType="up"
        />
        <StatCard
          label="В работе"
          value={String(inProgress)}
          icon={<Clock size={18} className="text-accent2" />}
        />
      </div>

      {/* Table */}
      <Card>
        <h2 className="text-[15px] font-bold text-text-main mb-4">Неактивные пациенты</h2>

        <div className="overflow-x-auto">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1fr_100px_100px_1fr_100px_140px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
            {(["Пациент", "Последний визит", "Дней", "Причина", "Статус", "Действие"] as const).map((h) => (
              <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {patients.map((p) => {
            const cfg = statusConfig[p.status];
            return (
              <div
                key={p.id}
                className="md:grid md:grid-cols-[1fr_100px_100px_1fr_100px_140px] gap-3 px-[14px] py-[11px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors flex flex-col items-start"
              >
                <span className="text-[13px] text-text-main font-bold">{p.name}</span>
                <span className="text-[12.5px] text-text-muted">{p.lastVisit}</span>
                <span className="text-[13px] font-bold" style={{ color: p.daysInactive > 150 ? "#f44b6e" : p.daysInactive > 100 ? "#f5a623" : "#1a55b0" }}>
                  {p.daysInactive}
                </span>
                <span className="text-[12.5px] text-text-muted">{p.reason}</span>
                <span>
                  <Pill variant={cfg.variant}>{cfg.label}</Pill>
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm">
                    <Phone size={12} className="mr-1" /> Позвонить
                  </Button>
                  <Button variant="ghost" size="sm">
                    <MessageSquare size={12} className="mr-1" /> Написать
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
