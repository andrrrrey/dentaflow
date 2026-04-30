import { useState, useEffect } from "react";
import { Search, LogOut } from "lucide-react";
import NotificationBell from "./NotificationBell";
import GlobalSearch from "../ui/GlobalSearch";
import { useAuthStore } from "../../store/authStore";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
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
            onClick={() => useAuthStore.getState().logout()}
            className="flex items-center gap-1.5 h-9 px-3 rounded-[10px] bg-[rgba(91,76,245,0.08)] border-none cursor-pointer text-text-muted transition-all duration-150 hover:bg-[rgba(244,75,110,0.12)] hover:text-[#f44b6e]"
            aria-label="Выйти"
          >
            <LogOut size={14} />
            <span className="text-[11px] font-semibold hidden sm:block">Выйти</span>
          </button>
        </div>
      </header>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </>
  );
}
