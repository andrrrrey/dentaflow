import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { LayoutDashboard, X } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";
import { useActiveTaskCount } from "../../api/tasks";
import { useUnreadChatsCount } from "../../api/communications";
import { sections, badgeColorMap } from "./navConfig";

/**
 * Мобильное бургер-меню: выезжает слева со ВСЕМИ пунктами навигации
 * (единый источник — navConfig). Заменяет прежний нижний горизонтальный бар.
 * Виден только ниже md-брейкпоинта.
 */
export default function MobileDrawer() {
  const location = useLocation();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);

  const { data: taskCountData } = useActiveTaskCount();
  const activeTaskCount = taskCountData?.active ?? 0;
  const { data: unreadChatsData } = useUnreadChatsCount();
  const unreadChats = unreadChatsData?.unread ?? 0;

  const badgeCountByPath: Record<string, number> = {
    "/tasks": activeTaskCount,
    "/chats": unreadChats,
  };

  const userRole = authUser?.role ?? "";
  const displayName = authUser?.name ?? "Пользователь";
  const displayRole = authUser?.role ?? "";
  const avatarUrl = authUser?.avatar_url;
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Закрытие по Esc.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  function go(path: string) {
    navigate(path);
    setOpen(false);
  }

  return (
    <div className={clsx("md:hidden", !open && "pointer-events-none")}>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={clsx(
          "fixed inset-0 z-[290] bg-black/35 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Drawer */}
      <aside
        className={clsx(
          "fixed left-0 top-0 h-full z-[300] flex flex-col transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          width: "var(--sidebar-w)",
          maxWidth: "82vw",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(24px)",
          borderRight: "1px solid var(--glass-border)",
          boxShadow: "4px 0 24px rgba(91,76,245,0.12)",
        }}
      >
        {/* Header row */}
        <div
          className="flex items-center gap-[10px] pt-[18px] pb-[16px] px-5"
          style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}
        >
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg, var(--accent2), var(--accent))" }}
          >
            <LayoutDashboard size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold tracking-tight">
              Denta<span className="text-accent2">Flow</span>
            </div>
            <div className="text-[10px] text-text-muted font-medium mt-px">Умная система клиники</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Закрыть меню"
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer border-none bg-transparent text-text-muted hover:bg-[rgba(91,76,245,0.1)] hover:text-accent2 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-[14px] px-[10px]">
          {sections.map((section, idx) => {
            const visibleItems = section.items.filter(
              (item) => !item.hideForRoles || !item.hideForRoles.includes(userRole),
            );
            if (visibleItems.length === 0) return null;
            return (
              <div
                key={idx}
                className={clsx("mb-1", idx > 0 && "mt-2 pt-2 border-t border-[rgba(91,76,245,0.1)]")}
              >
                {visibleItems.map((item) => {
                  const active = item.path.includes("*")
                    ? location.pathname.startsWith(item.path.replace("/*", ""))
                    : location.pathname === item.path ||
                      (item.path !== "/" &&
                        location.pathname.startsWith(item.path.split("/").slice(0, 2).join("/")));
                  const count = badgeCountByPath[item.path] ?? 0;
                  return (
                    <div
                      key={item.path}
                      onClick={() => go(item.path)}
                      className={clsx(
                        "flex items-center gap-[10px] py-[11px] px-3 rounded-xl cursor-pointer transition-all duration-150 text-[14px] font-medium relative",
                        active
                          ? "font-bold text-accent2"
                          : "text-text-muted hover:text-text-main hover:bg-[rgba(91,76,245,0.07)]",
                      )}
                      style={
                        active
                          ? {
                              background:
                                "linear-gradient(135deg, rgba(91,76,245,0.14), rgba(59,127,237,0.10))",
                            }
                          : undefined
                      }
                    >
                      <span className="w-5 flex items-center justify-center flex-shrink-0">
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                      {count > 0 && (
                        <span className="ml-auto text-white text-[10px] font-bold px-[6px] py-[2px] rounded-[10px] bg-danger">
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                      {!(item.path in badgeCountByPath) && item.badge && (
                        <span
                          className={clsx(
                            "ml-auto text-white text-[10px] font-bold px-[6px] py-[2px] rounded-[10px]",
                            badgeColorMap[item.badgeColor ?? "red"],
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User */}
        <div
          className="flex items-center gap-[10px] py-3 px-[14px]"
          style={{ borderTop: "1px solid rgba(91,76,245,0.08)" }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-[34px] h-[34px] rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
            >
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-bold truncate">{displayName}</div>
            <div className="text-[11px] text-text-muted">{displayRole}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
