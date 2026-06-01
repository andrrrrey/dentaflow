import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard,
  CalendarDays,
  PhoneCall,
  ClipboardList,
  BarChart3,
  MessageSquare,
  GitBranch,
  Users,
  UserCheck,
  BookOpen,
  FileBarChart,
  Settings,
  Megaphone,
  CheckSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";
import { useActiveTaskCount } from "../../api/tasks";

/* ---------- types ---------- */

interface NavItem {
  label: string;
  icon: ReactNode;
  path: string;
  badge?: string;
  badgeColor?: "red" | "blue" | "green";
  hideForRoles?: string[];
}

interface NavSection {
  items: NavItem[];
}

interface SidebarProps {
  currentUser?: { name: string; role: string };
}

/* ---------- nav config ---------- */

const sections: NavSection[] = [
  {
    items: [
      { label: "Обзор", icon: <LayoutDashboard size={15} />, path: "/" },
      { label: "Расписание", icon: <CalendarDays size={15} />, path: "/schedule" },
      { label: "Пациенты", icon: <UserCheck size={15} />, path: "/patients" },
      { label: "Контроль звонков", icon: <PhoneCall size={15} />, path: "/calls" },
      { label: "Контроль скриптов", icon: <ClipboardList size={15} />, path: "/scripts" },
      { label: "Аналитика", icon: <BarChart3 size={15} />, path: "/analytics", hideForRoles: ["admin"] },
    ],
  },
  {
    items: [
      {
        label: "Коммуникации",
        icon: <MessageSquare size={15} />,
        path: "/communications",
      },
      {
        label: "Воронка",
        icon: <GitBranch size={15} />,
        path: "/pipeline",
      },
      {
        label: "Задачи",
        icon: <CheckSquare size={15} />,
        path: "/tasks",
      },
    ],
  },
  {
    items: [
      { label: "Маркетинг", icon: <Megaphone size={15} />, path: "/marketing/discounts" },
      { label: "Справочники", icon: <BookOpen size={15} />, path: "/directories" },
      { label: "Отчёты", icon: <FileBarChart size={15} />, path: "/reports", hideForRoles: ["admin"] },
      { label: "Сотрудники", icon: <Users size={15} />, path: "/staff", hideForRoles: ["admin"] },
      { label: "Настройки", icon: <Settings size={15} />, path: "/settings", hideForRoles: ["admin"] },
    ],
  },
];

/* ---------- badge colors ---------- */

const badgeColorMap: Record<string, string> = {
  red: "bg-danger",
  blue: "bg-accent2",
  green: "bg-accent3",
};

/* ---------- component ---------- */

export default function Sidebar({ currentUser: _currentUser }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { data: taskCountData } = useActiveTaskCount();
  const activeTaskCount = taskCountData?.active ?? 0;

  const displayName = authUser?.name ?? _currentUser?.name ?? "Пользователь";
  const displayRole = authUser?.role ?? _currentUser?.role ?? "";
  const avatarUrl = authUser?.avatar_url;
  const userRole = authUser?.role ?? _currentUser?.role ?? "";

  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside
      className="hidden md:flex flex-col flex-shrink-0 h-screen z-[100] transition-[width] duration-200"
      style={{
        width: collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)",
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(24px)",
        borderRight: "1px solid var(--glass-border)",
        boxShadow: "4px 0 24px rgba(91,76,245,0.07)",
      }}
    >
      {/* Logo */}
      <div
        className={clsx(
          "flex items-center pt-[22px] pb-[18px]",
          collapsed ? "flex-col gap-3 px-2" : "gap-[10px] px-5",
        )}
        style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}
      >
        <div className={clsx("flex items-center", collapsed ? "" : "gap-[10px] flex-1 min-w-0")}>
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white text-lg flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--accent2), var(--accent))",
            }}
          >
            <LayoutDashboard size={18} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[17px] font-extrabold tracking-tight">
                Denta<span className="text-accent2">Flow</span>
              </div>
              <div className="text-[10px] text-text-muted font-medium mt-px">
                Умная система клиники
              </div>
            </div>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer border-none bg-transparent text-text-muted hover:bg-[rgba(91,76,245,0.1)] hover:text-accent2 transition-colors flex-shrink-0"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-[14px] px-[10px]">
        {sections.map((section, idx) => {
          const visibleItems = section.items.filter(
            (item) => !item.hideForRoles || !item.hideForRoles.includes(userRole)
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
                  (item.path !== "/" && location.pathname.startsWith(item.path.split("/").slice(0, 2).join("/")));
              return (
                <div
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  title={collapsed ? item.label : undefined}
                  className={clsx(
                    "flex items-center gap-[10px] py-[9px] rounded-xl cursor-pointer transition-all duration-150 text-[13px] font-medium relative",
                    collapsed ? "justify-center px-0" : "px-3",
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
                  <span className="w-5 flex items-center justify-center flex-shrink-0 relative">
                    {item.icon}
                    {collapsed && item.path === "/tasks" && activeTaskCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full bg-danger flex items-center justify-center text-white text-[8px] font-bold leading-none">
                        {activeTaskCount > 99 ? "99" : activeTaskCount}
                      </span>
                    )}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.path === "/tasks" && activeTaskCount > 0 && (
                    <span className="ml-auto text-white text-[10px] font-bold px-[6px] py-[2px] rounded-[10px] bg-danger">
                      {activeTaskCount > 99 ? "99+" : activeTaskCount}
                    </span>
                  )}
                  {!collapsed && item.path !== "/tasks" && item.badge && (
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
        className={clsx("flex items-center gap-[10px] py-3", collapsed ? "justify-center px-2" : "px-[14px]")}
        style={{ borderTop: "1px solid rgba(91,76,245,0.08)" }}
        title={collapsed ? `${displayName}${displayRole ? ` · ${displayRole}` : ""}` : undefined}
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
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-bold truncate">{displayName}</div>
            <div className="text-[11px] text-text-muted">{displayRole}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
