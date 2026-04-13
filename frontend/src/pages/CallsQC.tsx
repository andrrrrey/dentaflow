import Card from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import Pill from "../components/ui/Pill";
import { PhoneCall, BarChart3, CheckCircle } from "lucide-react";

/* ---------- types ---------- */

interface CallRecord {
  date: string;
  admin: string;
  patient: string;
  duration: string;
  score: number;
  status: "good" | "average" | "poor";
}

/* ---------- mock data ---------- */

const calls: CallRecord[] = [
  { date: "13.04.2026", admin: "Ольга Смирнова", patient: "Кузнецов А.В.", duration: "4:32", score: 92, status: "good" },
  { date: "13.04.2026", admin: "Мария Волкова", patient: "Попова Н.А.", duration: "3:15", score: 85, status: "good" },
  { date: "12.04.2026", admin: "Анна Кузнецова", patient: "Лебедев М.Ю.", duration: "6:48", score: 78, status: "average" },
  { date: "12.04.2026", admin: "Ольга Смирнова", patient: "Морозова И.П.", duration: "2:55", score: 95, status: "good" },
  { date: "11.04.2026", admin: "Елена Морозова", patient: "Волков Д.С.", duration: "5:10", score: 62, status: "average" },
  { date: "11.04.2026", admin: "Мария Волкова", patient: "Семёнова Т.Л.", duration: "7:22", score: 45, status: "poor" },
  { date: "10.04.2026", admin: "Анна Кузнецова", patient: "Григорьев О.К.", duration: "3:40", score: 88, status: "good" },
  { date: "10.04.2026", admin: "Елена Морозова", patient: "Фёдоров В.Н.", duration: "4:05", score: 55, status: "poor" },
  { date: "09.04.2026", admin: "Ольга Смирнова", patient: "Андреева Е.В.", duration: "3:18", score: 90, status: "good" },
  { date: "09.04.2026", admin: "Мария Волкова", patient: "Захарова Л.Д.", duration: "5:55", score: 73, status: "average" },
];

function scoreColor(score: number): string {
  if (score >= 80) return "#00c9a7";
  if (score >= 60) return "#f5a623";
  return "#f44b6e";
}

function scoreVariant(status: CallRecord["status"]): "green" | "yellow" | "red" {
  if (status === "good") return "green";
  if (status === "average") return "yellow";
  return "red";
}

/* ---------- component ---------- */

export default function CallsQC() {
  const avgScore = Math.round(calls.reduce((s, c) => s + c.score, 0) / calls.length);
  const totalCalls = calls.length;
  const scriptCompliance = 76;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <StatCard
          label="Средняя оценка"
          value={`${avgScore}%`}
          icon={<BarChart3 size={20} className="text-accent2" />}
          delta="+2.1% к пр. неделе"
          deltaType="up"
        />
        <StatCard
          label="Кол-во звонков"
          value={String(totalCalls)}
          icon={<PhoneCall size={20} className="text-accent3" />}
        />
        <StatCard
          label="% соответствия скрипту"
          value={`${scriptCompliance}%`}
          icon={<CheckCircle size={20} className="text-yellow-500" />}
          delta="-1.5%"
          deltaType="down"
        />
      </div>

      {/* Calls table */}
      <Card>
        <h2 className="text-[15px] font-bold mb-4">Контроль качества звонков</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-text-muted font-semibold uppercase tracking-wider">
                <th className="pb-3 pr-4">Дата</th>
                <th className="pb-3 pr-4">Администратор</th>
                <th className="pb-3 pr-4">Пациент</th>
                <th className="pb-3 pr-4">Длительность</th>
                <th className="pb-3 pr-4">Оценка</th>
                <th className="pb-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call, i) => (
                <tr
                  key={i}
                  className="border-t border-[rgba(91,76,245,0.06)] hover:bg-[rgba(91,76,245,0.03)] transition-colors"
                >
                  <td className="py-[10px] pr-4 text-text-muted">{call.date}</td>
                  <td className="py-[10px] pr-4 font-medium">{call.admin}</td>
                  <td className="py-[10px] pr-4">{call.patient}</td>
                  <td className="py-[10px] pr-4 text-text-muted">{call.duration}</td>
                  <td className="py-[10px] pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-[60px] h-[6px] rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${call.score}%`,
                            backgroundColor: scoreColor(call.score),
                          }}
                        />
                      </div>
                      <span className="font-semibold text-[12px]">{call.score}%</span>
                    </div>
                  </td>
                  <td className="py-[10px]">
                    <Pill variant={scoreVariant(call.status)}>
                      {call.status === "good" ? "Хорошо" : call.status === "average" ? "Средне" : "Плохо"}
                    </Pill>
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
