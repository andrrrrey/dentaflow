import StatCard from "../components/ui/StatCard";
import Pill from "../components/ui/Pill";
import Card from "../components/ui/Card";
import { CalendarDays, CheckCircle, Clock } from "lucide-react";

/* ---------- types ---------- */

interface Appointment {
  id: number;
  time: string;
  doctor: string;
  patient: string;
  service: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
}

/* ---------- mock data ---------- */

const appointments: Appointment[] = [
  { id: 1, time: "09:00", doctor: "Иванова Е.А.", patient: "Кузнецов Алексей", service: "Осмотр + чистка", status: "completed" },
  { id: 2, time: "09:30", doctor: "Петров С.В.", patient: "Сидорова Мария", service: "Протезирование", status: "completed" },
  { id: 3, time: "10:00", doctor: "Иванова Е.А.", patient: "Волков Дмитрий", service: "Лечение кариеса", status: "completed" },
  { id: 4, time: "10:30", doctor: "Козлов Д.И.", patient: "Морозова Анна", service: "Установка брекетов", status: "confirmed" },
  { id: 5, time: "11:00", doctor: "Сидорова М.К.", patient: "Николаев Игорь", service: "Удаление зуба", status: "confirmed" },
  { id: 6, time: "11:30", doctor: "Новикова А.П.", patient: "Попова Елена", service: "Отбеливание", status: "scheduled" },
  { id: 7, time: "12:00", doctor: "Иванова Е.А.", patient: "Лебедев Сергей", service: "Пломбирование", status: "scheduled" },
  { id: 8, time: "13:30", doctor: "Петров С.В.", patient: "Козлова Ирина", service: "Виниры", status: "cancelled" },
  { id: 9, time: "14:00", doctor: "Козлов Д.И.", patient: "Фёдоров Андрей", service: "Коррекция брекетов", status: "confirmed" },
  { id: 10, time: "14:30", doctor: "Сидорова М.К.", patient: "Егорова Ольга", service: "Имплантация", status: "no_show" },
  { id: 11, time: "15:00", doctor: "Новикова А.П.", patient: "Смирнов Павел", service: "Осмотр", status: "scheduled" },
  { id: 12, time: "16:00", doctor: "Иванова Е.А.", patient: "Васильева Татьяна", service: "Лечение пульпита", status: "scheduled" },
];

/* ---------- status config ---------- */

const statusConfig: Record<Appointment["status"], { label: string; variant: "blue" | "green" | "purple" | "red" | "yellow" }> = {
  scheduled: { label: "Запланирован", variant: "blue" },
  confirmed: { label: "Подтверждён", variant: "green" },
  completed: { label: "Завершён", variant: "purple" },
  cancelled: { label: "Отменён", variant: "red" },
  no_show: { label: "Не явился", variant: "yellow" },
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
          icon={<CalendarDays size={18} className="text-accent2" />}
          delta="+3 к вчера"
          deltaType="up"
        />
        <StatCard
          label="Подтверждено"
          value={String(confirmed)}
          icon={<CheckCircle size={18} className="text-accent3" />}
        />
        <StatCard
          label="Свободных слотов"
          value={String(freeSlots)}
          icon={<Clock size={18} className="text-accent2" />}
        />
      </div>

      {/* Schedule table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-text-main">Расписание на сегодня</h2>
          <span className="text-[12px] text-text-muted font-medium">13 апреля 2026</span>
        </div>

        <div className="overflow-x-auto">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[70px_1fr_1fr_1fr_130px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
            {(["Время", "Врач", "Пациент", "Услуга", "Статус"] as const).map((h) => (
              <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {appointments.map((apt) => {
            const cfg = statusConfig[apt.status];
            return (
              <div
                key={apt.id}
                className="md:grid md:grid-cols-[70px_1fr_1fr_1fr_130px] gap-3 px-[14px] py-[11px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors flex flex-col"
              >
                <span className="text-[13px] font-bold text-accent2">{apt.time}</span>
                <span className="text-[13px] text-text-main font-medium">{apt.doctor}</span>
                <span className="text-[13px] text-text-main">{apt.patient}</span>
                <span className="text-[12.5px] text-text-muted">{apt.service}</span>
                <span>
                  <Pill variant={cfg.variant}>{cfg.label}</Pill>
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
