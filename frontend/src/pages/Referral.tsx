import StatCard from "../components/ui/StatCard";
import Pill from "../components/ui/Pill";
import Card from "../components/ui/Card";
import { Gift, Users, CreditCard } from "lucide-react";

/* ---------- types ---------- */

interface ReferralEntry {
  id: number;
  name: string;
  invited: number;
  status: "active" | "inactive" | "top";
  bonus: number;
}

/* ---------- mock data ---------- */

const referrals: ReferralEntry[] = [
  { id: 1, name: "Сидоров Иван Петрович", invited: 8, status: "top", bonus: 24000 },
  { id: 2, name: "Козлова Елена Сергеевна", invited: 5, status: "active", bonus: 15000 },
  { id: 3, name: "Новиков Алексей Дмитриевич", invited: 4, status: "active", bonus: 12000 },
  { id: 4, name: "Фёдорова Мария Александровна", invited: 3, status: "active", bonus: 9000 },
  { id: 5, name: "Григорьев Павел Олегович", invited: 1, status: "inactive", bonus: 3000 },
  { id: 6, name: "Орлова Дарья Викторовна", invited: 2, status: "active", bonus: 6000 },
];

/* ---------- helpers ---------- */

function formatRub(v: number): string {
  return v.toLocaleString("ru-RU") + " ₽";
}

const statusConfig: Record<ReferralEntry["status"], { label: string; variant: "green" | "yellow" | "purple" }> = {
  active: { label: "Активен", variant: "green" },
  inactive: { label: "Неактивен", variant: "yellow" },
  top: { label: "Топ реферал", variant: "purple" },
};

/* ---------- component ---------- */

export default function Referral() {
  const activeReferrals = referrals.filter((r) => r.status !== "inactive").length;
  const totalInvited = referrals.reduce((s, r) => s + r.invited, 0);
  const totalBonus = referrals.reduce((s, r) => s + r.bonus, 0);

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <StatCard
          label="Активных рефералов"
          value={String(activeReferrals)}
          icon={<Gift size={18} className="text-accent2" />}
          delta="+2 за месяц"
          deltaType="up"
        />
        <StatCard
          label="Приведено пациентов"
          value={String(totalInvited)}
          icon={<Users size={18} className="text-accent3" />}
          delta="+5 за месяц"
          deltaType="up"
        />
        <StatCard
          label="Выплачено бонусов"
          value={formatRub(totalBonus)}
          icon={<CreditCard size={18} className="text-accent2" />}
        />
      </div>

      {/* Table */}
      <Card>
        <h2 className="text-[15px] font-bold text-text-main mb-4">Реферальная программа</h2>

        <div className="overflow-x-auto">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1.5fr_100px_120px_100px] gap-3 px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
            {(["Реферал", "Приглашённых", "Статус", "Бонус"] as const).map((h) => (
              <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {referrals.map((r) => {
            const cfg = statusConfig[r.status];
            return (
              <div
                key={r.id}
                className="md:grid md:grid-cols-[1.5fr_100px_120px_100px] gap-3 px-[14px] py-[11px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors flex flex-col"
              >
                <span className="text-[13px] text-text-main font-bold">{r.name}</span>
                <span className="text-[13px] text-text-main font-bold text-center">{r.invited}</span>
                <span>
                  <Pill variant={cfg.variant}>{cfg.label}</Pill>
                </span>
                <span className="text-[13px] text-text-main font-bold text-right">
                  {formatRub(r.bonus)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
