import Card from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import Pill from "../components/ui/Pill";
import { CalendarDays, CheckCircle, Clock } from "lucide-react";

/* ---------- types ---------- */

interface Appointment {
  time: string;
  doctor: string;
  patient: string;
  service: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
}

/* ---------- mock data ---------- */

const appointments: Appointment[] = [
  { time: "09:00", doctor: "Иванова Е.А.", patient: "Кузнецов А.В.", service: "Терапия", status: "completed" },
  { time: "09:30", doctor: "Петров С.В.", patient: "Морозова И.П.", service: "Протезирование", status: "completed" },
  { time: "10:00", doctor: "Сидорова М.К.", patient: "Волков Д.С.", service: "Удаление зуба", status: "completed" },
  { time: "10:30", doctor: "Козлов Д.И.", patient: "Попова Н.А.", service: "Брекеты — коррекция", status: "confirmed" },
  { time: "11:00", doctor: "Иванова Е.А.", patient: "Лебедев М.Ю.", service: "Пломбирование", status: "confirmed" },
  { time: "11:30", doctor: "Новикова А.П.", patient: "Семёнова Т.Л.", service: "Чистка", status: "confirmed" },
  { time: "12:00", doctor: "Петров С.В.", patient: "Григорьев О.К.", service: "Виниры — консультация", status: "scheduled" },
  { time: "13:00", doctor: "Сидорова М.К.", patient: "Фёдоров В.Н.", service: "Имплантация", status: "scheduled" },
  { time: "14:00", doctor: "Козлов Д.И.", patient: "Андреева Е.В.", service: "Ортодонтия — осмотр", status: "scheduled" },
  { time: "14:30", doctor: "Иванова Е.А.", patient: "Белов П.С.", service: "Лечение кариеса", status: "cancelled" },
  { time: "15:00", doctor: "Новикова А.П.", patient: "Захарова Л.Д.", service: "Отбеливание", status: "no_show" },
  { time: "16:00", doctor: "Петров С.В.", patient: "Орлов И.И.", service: "Коронка — установка", status: "scheduled" },
];

const statusConfig: Record<Appointment["status"], { label: string; variant: "blue" | "green" | "purple" | "red" | "yellow" }> = {
  scheduled: { label: "Запланировано", variant: "blue" },
  confirmed: { label: "Подтверждено", variant: "green" },
  completed: { label: "Завершено", variant: "purple" },
  cancelled: { label: "Отменено", variant: "red" },
  no_show: { label: "Неявка", variant: "yellow" },
};

/* ---------- component ---------- */

export default function Schedule() {
  const totalAppointments = appointments.length;
  const confirmed = appointments.filter((a) => a.status === "confirmed").length;
  const freeSlots = 4;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <StatCard
          label="Всего записей"
          value={String(totalAppointments)}
          icon={<CalendarDays size={20} className="text-accent2" />}
          delta="+3 к вчера"
          deltaType="up"
        />
        <StatCard
          label="Подтверждено"
          value={String(confirmed)}
          icon={<CheckCircle size={20} className="text-accent3" />}
        />
        <StatCard
          label="Свободных слотов"
          value={String(freeSlots)}
          icon={<Clock size={20} className="text-yellow-500" />}
        />
      </div>

      {/* Schedule table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold">Расписание на сегодня</h2>
          <span className="text-[12px] text-text-muted font-medium">13 апреля 2026</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-text-muted font-semibold uppercase tracking-wider">
                <th className="pb-3 pr-4">Время</th>
                <th className="pb-3 pr-4">Врач</th>
                <th className="pb-3 pr-4">Пациент</th>
                <th className="pb-3 pr-4">Услуга</th>
                <th className="pb-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((apt, i) => {
                const cfg = statusConfig[apt.status];
                return (
                  <tr
                    key={i}
                    className="border-t border-[rgba(91,76,245,0.06)] hover:bg-[rgba(91,76,245,0.03)] transition-colors"
                  >
                    <td className="py-[10px] pr-4 font-semibold">{apt.time}</td>
                    <td className="py-[10px] pr-4">{apt.doctor}</td>
                    <td className="py-[10px] pr-4">{apt.patient}</td>
                    <td className="py-[10px] pr-4 text-text-muted">{apt.service}</td>
                    <td className="py-[10px]">
                      <Pill variant={cfg.variant}>{cfg.label}</Pill>
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
