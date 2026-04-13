import Card from "../ui/Card";
import Pill from "../ui/Pill";
import type { AdminRating } from "../../types";

interface AdminsRatingProps {
  admins: AdminRating[];
}

function scoreVariant(score: number) {
  if (score >= 4.5) return "green" as const;
  if (score >= 4.0) return "yellow" as const;
  return "red" as const;
}

export default function AdminsRating({ admins }: AdminsRatingProps) {
  return (
    <Card>
      <h3 className="text-sm font-extrabold mb-4">Рейтинг администраторов</h3>

      <table className="w-full text-left">
        <thead>
          <tr className="text-[11px] text-text-muted font-semibold uppercase tracking-wider">
            <th className="pb-2">Имя</th>
            <th className="pb-2 text-right">Конверсия</th>
            <th className="pb-2 text-right">Звонки</th>
            <th className="pb-2 text-right">Оценка</th>
          </tr>
        </thead>
        <tbody>
          {admins.map((a) => (
            <tr
              key={a.name}
              className="border-t border-[rgba(0,0,0,0.04)] text-[13px]"
            >
              <td className="py-[8px] font-medium">{a.name}</td>
              <td className="py-[8px] text-right font-semibold">
                {a.conversion}%
              </td>
              <td className="py-[8px] text-right text-text-muted">
                {a.calls}
              </td>
              <td className="py-[8px] text-right">
                <Pill variant={scoreVariant(a.score)}>{a.score}</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
