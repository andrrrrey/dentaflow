import StatCard from "../components/ui/StatCard";
import Card from "../components/ui/Card";
import Pill from "../components/ui/Pill";
import { Users, UserCheck, Phone } from "lucide-react";

/* ---------- types ---------- */

interface StaffMember {
  id: number;
  name: string;
  role: "owner" | "manager" | "admin" | "marketer";
  phone: string;
  email: string;
  calls: number;
  conversion: number;
}

/* ---------- mock data ---------- */

const staff: StaffMember[] = [
  { id: 1, name: "Петров Дмитрий Сергеевич", role: "owner", phone: "+7 (903) 111-22-33", email: "petrov@dentaflow.ru", calls: 0, conversion: 0 },
  { id: 2, name: "Алексеева Ирина Павловна", role: "manager", phone: "+7 (903) 222-33-44", email: "alekseeva@dentaflow.ru", calls: 48, conversion: 82 },
  { id: 3, name: "Смирнова Ольга Николаевна", role: "admin", phone: "+7 (903) 333-44-55", email: "smirnova@dentaflow.ru", calls: 124, conversion: 87 },
  { id: 4, name: "Волкова Мария Андреевна", role: "admin", phone: "+7 (903) 444-55-66", email: "volkova@dentaflow.ru", calls: 98, conversion: 79 },
  { id: 5, name: "Кузнецова Анна Игоревна", role: "admin", phone: "+7 (903) 555-66-77", email: "kuznetsova@dentaflow.ru", calls: 86, conversion: 72 },
  { id: 6, name: "Морозова Елена Викторовна", role: "admin", phone: "+7 (903) 666-77-88", email: "morozova@dentaflow.ru", calls: 72, conversion: 68 },
  { id: 7, name: "Новиков Артём Олегович", role: "marketer", phone: "+7 (903) 777-88-99", email: "novikov@dentaflow.ru", calls: 15, conversion: 0 },
  { id: 8, name: "Захарова Дарья Михайловна", role: "admin", phone: "+7 (903) 888-99-00", email: "zakharova@dentaflow.ru", calls: 64, conversion: 74 },
];

/* ---------- helpers ---------- */

const roleConfig: Record<StaffMember["role"], { label: string; variant: "purple" | "blue" | "green" | "yellow" }> = {
  owner: { label: "Владелец", variant: "purple" },
  manager: { label: "Управляющий", variant: "blue" },
  admin: { label: "Администратор", variant: "green" },
  marketer: { label: "Маркетолог", variant: "yellow" },
};

function getInitials(name: string): string {
  const parts = name.split(" ");
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

/* ---------- component ---------- */

export default function Staff() {
  const totalStaff = staff.length;
  const admins = staff.filter((s) => s.role === "admin").length;
  const avgConversion = Math.round(
    staff.filter((s) => s.conversion > 0).reduce((sum, s) => sum + s.conversion, 0) /
      staff.filter((s) => s.conversion > 0).length,
  );

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <StatCard
          label="Всего сотрудников"
          value={String(totalStaff)}
          icon={<Users size={18} className="text-accent2" />}
        />
        <StatCard
          label="Администраторов"
          value={String(admins)}
          icon={<UserCheck size={18} className="text-accent3" />}
        />
        <StatCard
          label="Средняя конверсия"
          value={`${avgConversion}%`}
          icon={<Phone size={18} className="text-accent2" />}
          delta="+2% к прошлому месяцу"
          deltaType="up"
        />
      </div>

      {/* Staff grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[14px]">
        {staff.map((member) => {
          const cfg = roleConfig[member.role];
          return (
            <Card key={member.id} className="flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div
                  className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-white text-[14px] font-bold flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
                >
                  {getInitials(member.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-text-main truncate">{member.name}</div>
                  <Pill variant={cfg.variant}>{cfg.label}</Pill>
                </div>
              </div>

              {/* Contact */}
              <div className="flex flex-col gap-1 text-[12px] text-text-muted">
                <span>{member.phone}</span>
                <span>{member.email}</span>
              </div>

              {/* Stats */}
              {(member.role === "admin" || member.role === "manager") && (
                <div className="flex gap-4 pt-2 border-t border-[rgba(91,76,245,0.08)]">
                  <div>
                    <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Звонки</div>
                    <div className="text-[16px] font-extrabold text-text-main">{member.calls}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Конверсия</div>
                    <div
                      className="text-[16px] font-extrabold"
                      style={{ color: member.conversion >= 80 ? "#00c9a7" : member.conversion >= 70 ? "#f5a623" : "#f44b6e" }}
                    >
                      {member.conversion}%
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
