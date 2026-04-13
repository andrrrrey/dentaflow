import StatCard from "../components/ui/StatCard";
import Pill from "../components/ui/Pill";
import Card from "../components/ui/Card";
import { Phone, BarChart3, CheckCircle } from "lucide-react";

/* ---------- types ---------- */

interface CallRecord {
  id: number;
  date: string;
  admin: string;
  patient: string;
  duration: string;
  score: number;
  status: "excellent" | "good" | "poor";
}

/* ---------- mock data ---------- */

const calls: CallRecord[] = [
  { id: 1, date: "13.04.2026", admin: "Ольга Смирнова", patient: "Кузнецов Алексей", duration: "4:32", score: 94, status: "excellent" },
  { id: 2, date: "13.04.2026", admin: "Мария Волкова", patient: "Сидорова Мария", duration: "3:18", score: 87, status: "excellent" },
  { id: 3, date: "12.04.2026", admin: "Анна Кузнецова", patient: "Волков Дмитрий", duration: "6:45", score: 72, status: "good" },
  { id: 4, date: "12.04.2026", admin: "Елена Морозова", patient: "Морозова Анна", duration: "2:10", score: 58, status: "poor" },
  { id: 5, date: "12.04.2026", admin: "Ольга Смирнова", patient: "Николаев Игорь", duration: "5:22", score: 91, status: "excellent" },
  { id: 6, date: "11.04.2026", admin: "Мария Волкова", patient: "Попова Елена", duration: "3:55", score: 65, status: "good" },
  { id: 7, date: "11.04.2026", admin: "Анна Кузнецова", patient: "Лебедев Сергей", duration: "4:08", score: 79, status: "good" },
  { id: 8, date: "11.04.2026", admin: "Елена Морозова", patient: "Козлова Ирина", duration: "1:45", score: 43, status: "poor" },
  { id: 9, date: "10.04.2026", admin: "Ольга Смирнова", patient: "Фёдоров Андрей", duration: "5:10", score: 88, status: "excellent" },
  { id: 10, date: "10.04.2026", admin: "Мария Волкова", patient: "Егорова Ольга", duration: "3:30", score: 76, status: "good" },
];

/* ---------- helpers ---------- */

function scoreBarColor(score: number): string {
  if (score >= 80) return "#00c9a7";
  if (score >= 60) return "#f5a623";
  return "#f44b6e";
}

function scoreVariant(score: number): "green" | "yellow" | "red" {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

/* ---------- component ---------- */

export default function CallsQC() {
  const avgScore = Math.round(calls.reduce((s, c) => s + c.score, 0) / calls.length);
  const totalCalls = calls.length;
  const scriptCompliance = 78;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <StatCard
          label="Средняя оценка"
          value={`${avgScore}%`}
          icon={<BarChart3 size={18} className="text-accent2" />}
          delta="+2.3% к прошлой неделе"
          deltaType="up"
        />
        <StatCard
          label="Кол-во звонков"
          value={String(totalCalls)}
          icon={<Phone size={18} className="text-accent3" />}
        />
        <StatCard
          label="% соответствия скрипту"
          value={`${scriptCompliance}%`}
          icon={<CheckCircle size={18} className="text-accent2" />}
          delta="+5% к прошлому месяцу"
          deltaType="up"
        />
      </div>

      {/* Calls table */}
      <Card>
        <h2 className="text-[15px] font-bold text-text-main mb-4">Последние звонки</h2>

        <div className="overflow-x-auto">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[90px_1fr_1fr_80px_180px_100px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
            {(["Дата", "Администратор", "Пациент", "Длит.", "Оценка", "Статус"] as const).map((h) => (
              <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {calls.map((call) => (
            <div
              key={call.id}
              className="md:grid md:grid-cols-[90px_1fr_1fr_80px_180px_100px] gap-3 px-[14px] py-[11px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors flex flex-col"
            >
              <span className="text-[12.5px] text-text-muted">{call.date}</span>
              <span className="text-[13px] text-text-main font-medium">{call.admin}</span>
              <span className="text-[13px] text-text-main">{call.patient}</span>
              <span className="text-[12.5px] text-text-muted">{call.duration}</span>
              {/* Score bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-[6px] rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${call.score}%`,
                      background: scoreBarColor(call.score),
                    }}
                  />
                </div>
                <span className="text-[12px] font-bold text-text-main w-[32px] text-right">
                  {call.score}%
                </span>
              </div>
              <span>
                <Pill variant={scoreVariant(call.score)}>
                  {call.score >= 80 ? "Отлично" : call.score >= 60 ? "Норма" : "Плохо"}
                </Pill>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
