import { Trophy, Star } from "lucide-react";
import Card from "../ui/Card";
import { useLeaderboard } from "../../api/rewards";

/**
 * "Рейтинг администраторов" с баллами.
 * Shared between the Staff page and the main Dashboard.
 */
export default function AdminLeaderboard() {
  const { data } = useLeaderboard();
  const items = data?.items ?? [];

  const getMedal = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}`;
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={16} className="text-[#f5a623]" />
        <h2 className="text-[15px] font-bold">Рейтинг администраторов</h2>
      </div>
      {items.length === 0 ? (
        <div className="text-center text-text-muted py-6 text-[13px]">
          Баллы ещё не начислялись. Рейтинг появится после первых выполненных задач.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
                {["Место", "Администратор", "Выполнено задач", "Баллы"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[10.5px] font-bold text-text-muted uppercase tracking-[0.8px] pb-[10px] px-[12px]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr
                  key={entry.user_id}
                  className="hover:bg-[rgba(91,76,245,0.03)]"
                  style={{ borderBottom: "1px solid rgba(91,76,245,0.05)" }}
                >
                  <td className="py-[10px] px-[12px]">
                    <span className="text-[18px]">{getMedal(entry.rank)}</span>
                  </td>
                  <td className="py-[10px] px-[12px]">
                    <div className="flex items-center gap-2">
                      {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt={entry.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                          style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}
                        >
                          {entry.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-[13px] font-semibold">{entry.name}</span>
                    </div>
                  </td>
                  <td className="py-[10px] px-[12px] text-[13px] text-text-muted">{entry.tasks_completed}</td>
                  <td className="py-[10px] px-[12px]">
                    <div className="flex items-center gap-1">
                      <Star size={13} className="text-[#f5a623]" />
                      <span className="text-[14px] font-bold text-text-main">{entry.total_points}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
