import { useState, useEffect } from "react";
import clsx from "clsx";
import { Search, Settings } from "lucide-react";
import NotificationBell from "./NotificationBell";
import GlobalSearch from "../ui/GlobalSearch";

type Period = "day" | "week" | "month";

interface HeaderProps {
  title: string;
  period?: Period;
  onPeriodChange?: (p: Period) => void;
}

const periodLabels: { key: Period; label: string }[] = [
  { key: "day", label: "День" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
];

export default function Header({ title, period, onPeriodChange }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
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
        <div className="flex gap-[7px] items-center">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 h-9 px-3 rounded-[10px] bg-[rgba(91,76,245,0.08)] border-none cursor-pointer text-text-muted transition-all duration-150 hover:bg-[rgba(91,76,245,0.15)] hover:text-text-main"
            aria-label="Поиск"
          >
            <Search size={14} />
            <span className="text-[11px] hidden sm:block">Поиск</span>
            <kbd className="hidden sm:block text-[10px] font-mono bg-[rgba(91,76,245,0.1)] px-1.5 py-0.5 rounded">
              ⌘K
            </kbd>
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

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </>
  );
}
