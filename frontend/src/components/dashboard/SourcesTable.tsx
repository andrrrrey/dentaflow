import Card from "../ui/Card";
import type { SourceItem } from "../../types";

interface SourcesTableProps {
  sources: SourceItem[];
}

export default function SourcesTable({ sources }: SourcesTableProps) {
  return (
    <Card>
      <h3 className="text-sm font-extrabold mb-4">Источники лидов</h3>

      <table className="w-full text-left">
        <thead>
          <tr className="text-[11px] text-text-muted font-semibold uppercase tracking-wider">
            <th className="pb-2">Источник</th>
            <th className="pb-2 text-right">Лиды</th>
            <th className="pb-2 text-right">Конверсия</th>
            <th className="pb-2 text-right">CPL</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr
              key={s.channel}
              className="border-t border-[rgba(0,0,0,0.04)] text-[13px]"
            >
              <td className="py-[8px] font-medium">{s.channel}</td>
              <td className="py-[8px] text-right font-semibold">{s.leads}</td>
              <td className="py-[8px] text-right font-semibold">
                {s.conversion}%
              </td>
              <td className="py-[8px] text-right text-text-muted">
                {s.cpl > 0 ? `${s.cpl} ₽` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
