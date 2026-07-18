import { useNavigate } from "react-router-dom";
import { Trophy, Share2 } from "lucide-react";
import { useLoyaltyStats, type RatingEntry } from "../../api/loyalty";

const cardStyle = {
  background: "rgba(255,255,255,0.65)",
  backdropFilter: "blur(18px)",
  border: "1px solid rgba(255,255,255,0.85)",
  boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
};

const MEDALS = ["🥇", "🥈", "🥉"];

function RatingTable({ title, icon, items, unit, onOpen }: {
  title: string; icon: React.ReactNode; items: RatingEntry[]; unit: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="rounded-[18px] p-5 flex flex-col gap-3" style={cardStyle}>
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-[14px] font-bold">{title}</h3>
      </div>
      {items.length === 0 && (
        <div className="text-[13px] text-text-muted py-4 text-center">Пока нет данных</div>
      )}
      {items.map((r) => (
        <button key={r.patient_id} onClick={() => onOpen(r.patient_id)}
          className="flex items-center gap-3 py-[7px] px-2 rounded-[10px] hover:bg-[rgba(91,76,245,0.05)] border-none bg-transparent cursor-pointer text-left transition-colors">
          <span className="w-6 text-center text-[14px] font-bold text-text-muted flex-shrink-0">
            {r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}
          </span>
          <span className="flex-1 text-[13px] font-semibold text-text-main truncate">{r.name}</span>
          <span className="text-[13px] font-bold text-accent2 flex-shrink-0">
            {r.value.toLocaleString("ru-RU")} {unit}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function LoyaltyRatings() {
  const { data, isLoading } = useLoyaltyStats();
  const navigate = useNavigate();

  if (isLoading || !data) {
    return <div className="text-center py-10 text-text-muted text-[13px]">Загрузка...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <RatingTable
        title="Топ по баллам"
        icon={<Trophy size={15} className="text-accent2" />}
        items={data.top_by_balance}
        unit="б."
        onOpen={(id) => navigate(`/patients/${id}`)}
      />
      <RatingTable
        title="Топ по рекомендациям"
        icon={<Share2 size={15} className="text-accent2" />}
        items={data.top_by_referrals}
        unit="реф."
        onOpen={(id) => navigate(`/patients/${id}`)}
      />
    </div>
  );
}
