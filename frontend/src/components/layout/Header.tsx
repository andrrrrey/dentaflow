import clsx from "clsx";
import { Search, Settings } from "lucide-react";
import NotificationBell from "./NotificationBell";

type Period = "day" | "week" | "month";

interface HeaderProps {
  title: string;
  period?: Period;
  onPeriodChange?: (p: Period) => void;
}

const periodLabels: { key: Period; label: string }[] = [
  { key: "day", label: "\u0414\u0435\u043D\u044C" },
  { key: "week", label: "\u041D\u0435\u0434\u0435\u043B\u044F" },
  { key: "month", label: "\u041C\u0435\u0441\u044F\u0446" },
];

export default function Header({ title, period, onPeriodChange }: HeaderProps) {
  return (
    <header
      className="flex items-center gap-[14px] px-6 flex-shrink-0 z-50"
      style={{
        height: "var(--header-h)",
        background: "rgba(255,255,255,0.62)",
        backdropFilter: "blur(18px)",
        borderBottom: "1px solid var(--glass-border)",
      }}
    >
      {/* Title */}
      <h1 className="text-base font-extrabold flex-1">{title}</h1>

      {/* Period tabs */}
      {period !== undefined && onPeriodChange && (
        <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)]">
          {periodLabels.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onPeriodChange(key)}
              className={clsx(
                "px-[13px] py-[5px] rounded-[9px] text-xs font-semibold cursor-pointer transition-all duration-150 border-none bg-transparent",
                period === key
                  ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]"
                  : "text-text-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-[7px]">
        <button
          className="w-9 h-9 rounded-[10px] bg-[rgba(91,76,245,0.08)] border-none cursor-pointer flex items-center justify-center text-text-main transition-all duration-150 hover:bg-[rgba(91,76,245,0.15)]"
          aria-label="Search"
        >
          <Search size={15} />
        </button>

        <NotificationBell />

        <button
          className="w-9 h-9 rounded-[10px] bg-[rgba(91,76,245,0.08)] border-none cursor-pointer flex items-center justify-center text-text-main transition-all duration-150 hover:bg-[rgba(91,76,245,0.15)]"
          aria-label="Settings"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
}
