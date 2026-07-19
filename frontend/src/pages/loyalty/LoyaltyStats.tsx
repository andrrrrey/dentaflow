import { Award, Users, Star, Share2, Wallet } from "lucide-react";
import { useLoyaltyStats } from "../../api/loyalty";

const cardStyle = {
  background: "rgba(255,255,255,0.65)",
  backdropFilter: "blur(18px)",
  border: "1px solid rgba(255,255,255,0.85)",
  boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
};

const ACTION_LABEL: Record<string, string> = {
  purchase: "За покупки",
  referral: "За рекомендации",
  review: "За отзывы",
  manual: "Ручные корректировки",
};

function StatTile({ icon, label, value, tint }: {
  icon: React.ReactNode; label: string; value: string | number; tint: string;
}) {
  return (
    <div className="rounded-[16px] p-4 flex items-center gap-3" style={cardStyle}>
      <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
        style={{ background: tint }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[20px] font-extrabold leading-none">{value}</div>
        <div className="text-[11.5px] text-text-muted mt-1">{label}</div>
      </div>
    </div>
  );
}

export default function LoyaltyStatsPage() {
  const { data, isLoading } = useLoyaltyStats();

  if (isLoading || !data) {
    return <div className="text-center py-10 text-text-muted text-[13px]">Загрузка...</div>;
  }

  const byAction = Object.entries(data.points_by_action);
  const maxVal = Math.max(1, ...byAction.map(([, v]) => v));

  return (
    <div className="flex flex-col gap-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={<Award size={18} className="text-white" />} tint="linear-gradient(135deg,#5B4CF5,#3B7FED)"
          label="Всего начислено баллов" value={data.total_points_awarded.toLocaleString("ru-RU")} />
        <StatTile icon={<Users size={18} className="text-white" />} tint="linear-gradient(135deg,#00C9A7,#3B7FED)"
          label="Активных участников" value={data.active_patients} />
        <StatTile icon={<Share2 size={18} className="text-white" />} tint="linear-gradient(135deg,#F5A623,#f44b6e)"
          label="Начислений за рекомендации" value={data.total_referrals} />
        <StatTile icon={<Star size={18} className="text-white" />} tint="linear-gradient(135deg,#f44b6e,#5B4CF5)"
          label="Отзывов на проверке" value={data.pending_reviews} />
      </div>

      {/* Points by action */}
      <div className="rounded-[18px] p-5 flex flex-col gap-3" style={cardStyle}>
        <div className="flex items-center gap-2">
          <Wallet size={15} className="text-accent2" />
          <h3 className="text-[14px] font-bold">Баллы по типам действий</h3>
        </div>
        {byAction.length === 0 && (
          <div className="text-[13px] text-text-muted py-4 text-center">Пока нет начислений</div>
        )}
        {byAction.map(([action, value]) => (
          <div key={action} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-text-main font-medium">{ACTION_LABEL[action] ?? action}</span>
              <span className="font-bold text-accent2">{value.toLocaleString("ru-RU")}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(91,76,245,0.10)" }}>
              <div className="h-full rounded-full"
                style={{ width: `${(value / maxVal) * 100}%`, background: "linear-gradient(90deg,#5B4CF5,#3B7FED)" }} />
            </div>
          </div>
        ))}
        <div className="text-[12px] text-text-muted pt-1">
          Одобрено отзывов: <b>{data.approved_reviews}</b>
        </div>
      </div>
    </div>
  );
}
