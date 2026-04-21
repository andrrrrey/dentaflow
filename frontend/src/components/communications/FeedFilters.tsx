import clsx from "clsx";
import { useCommunicationsStore } from "../../store/communicationsStore";

interface StatusTab {
  key: string | undefined;
  label: string;
  count?: number;
}

interface ChannelOption {
  key: string | undefined;
  label: string;
}

interface Props {
  statusCounts: Record<string, number>;
}

const CHANNEL_OPTIONS: ChannelOption[] = [
  { key: undefined, label: "Все каналы" },
  { key: "telegram", label: "Telegram" },
  { key: "novofon", label: "Телефония" },
  { key: "max", label: "Max/VK" },
  { key: "site", label: "Сайт" },
];

export default function FeedFilters({ statusCounts }: Props) {
  const { filters, setFilter } = useCommunicationsStore();

  const STATUS_TABS: StatusTab[] = [
    { key: undefined, label: "Все", count: statusCounts.total },
    { key: "new", label: "Новые", count: statusCounts.new },
    { key: "in_progress", label: "В работе", count: statusCounts.in_progress },
    { key: "done", label: "Закрытые", count: statusCounts.done },
  ];

  return (
    <div
      className="rounded-glass p-[14px_18px] mb-4"
      style={{
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 20px rgba(120,140,180,0.18)",
      }}
    >
      {/* Status tabs */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {STATUS_TABS.map((tab) => {
          const active = filters.status === tab.key;
          return (
            <button
              key={tab.label}
              onClick={() => setFilter("status", tab.key)}
              className={clsx(
                "px-3 py-[6px] rounded-[10px] text-[12px] font-semibold transition-all duration-150 cursor-pointer border-none",
                active
                  ? "text-white"
                  : "text-text-muted bg-transparent hover:bg-[rgba(91,76,245,0.06)]",
              )}
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, #5B4CF5, #3B7FED)",
                      boxShadow: "0 2px 8px rgba(91,76,245,0.3)",
                    }
                  : undefined
              }
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={clsx(
                    "ml-1.5 px-[6px] py-[1px] rounded-full text-[10px] font-bold",
                    active
                      ? "bg-[rgba(255,255,255,0.25)] text-white"
                      : "bg-[rgba(91,76,245,0.1)] text-accent2",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Channel filter + priority pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filters.channel ?? ""}
          onChange={(e) =>
            setFilter("channel", e.target.value || undefined)
          }
          className="px-3 py-[5px] rounded-[10px] text-[12px] font-medium border cursor-pointer bg-white/50 text-text-primary"
          style={{ borderColor: "rgba(91,76,245,0.18)" }}
        >
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.key ?? ""}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          {(
            [
              { key: undefined, label: "Все", variant: "default" },
              { key: "urgent", label: "Срочный", variant: "red" },
              { key: "high", label: "Высокий", variant: "yellow" },
              { key: "normal", label: "Обычный", variant: "blue" },
            ] as const
          ).map((p) => {
            const active = filters.priority === p.key;
            const colorMap: Record<string, string> = {
              red: active
                ? "bg-[rgba(244,75,110,0.18)] text-[#c52048]"
                : "bg-transparent text-[#c52048] hover:bg-[rgba(244,75,110,0.08)]",
              yellow: active
                ? "bg-[rgba(245,166,35,0.18)] text-[#b87200]"
                : "bg-transparent text-[#b87200] hover:bg-[rgba(245,166,35,0.08)]",
              blue: active
                ? "bg-[rgba(59,127,237,0.18)] text-[#1a55b0]"
                : "bg-transparent text-[#1a55b0] hover:bg-[rgba(59,127,237,0.08)]",
              default: active
                ? "bg-[rgba(91,76,245,0.15)] text-accent2"
                : "bg-transparent text-text-muted hover:bg-[rgba(91,76,245,0.06)]",
            };
            return (
              <button
                key={p.label}
                onClick={() => setFilter("priority", p.key)}
                className={clsx(
                  "px-[9px] py-[3px] rounded-full text-[11px] font-semibold transition-all duration-150 cursor-pointer border-none",
                  colorMap[p.variant],
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
