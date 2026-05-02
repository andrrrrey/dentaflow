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
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuthStore } from "../../store/authStore";

/* ---------- types ---------- */

interface NavItem {
  label: string;
  icon: ReactNode;
  path: string;
  badge?: string;
  badgeColor?: "red" | "blue" | "green";
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
      { label: "Аналитика", icon: <BarChart3 size={15} />, path: "/analytics" },
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
      { label: "Отчёты", icon: <FileBarChart size={15} />, path: "/reports" },
      { label: "Сотрудники", icon: <Users size={15} />, path: "/staff" },
      { label: "Настройки", icon: <Settings size={15} />, path: "/settings" },
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

  const displayName = authUser?.name ?? _currentUser?.name ?? "Пользователь";
  const displayRole = authUser?.role ?? _currentUser?.role ?? "";
  const avatarUrl = authUser?.avatar_url;

  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside
      className="hidden md:flex flex-col flex-shrink-0 h-screen z-[100]"
      style={{
        width: "var(--sidebar-w)",
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(24px)",
        borderRight: "1px solid var(--glass-border)",
        boxShadow: "4px 0 24px rgba(91,76,245,0.07)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-[10px] px-5 pt-[22px] pb-[18px]"
        style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}
      >
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white text-lg"
          style={{
            background: "linear-gradient(135deg, var(--accent2), var(--accent))",
          }}
        >
          <LayoutDashboard size={18} />
        </div>
        <div>
          <div className="text-[17px] font-extrabold tracking-tight">
            Denta<span className="text-accent2">Flow</span>
          </div>
          <div className="text-[10px] text-text-muted font-medium mt-px">
            Умная система клиники
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-[14px] px-[10px]">
        {sections.map((section, idx) => (
          <div
            key={idx}
            className={clsx("mb-1", idx > 0 && "mt-2 pt-2 border-t border-[rgba(91,76,245,0.1)]")}
          >
            {section.items.map((item) => {
              const active = item.path.includes("*")
                ? location.pathname.startsWith(item.path.replace("/*", ""))
                : location.pathname === item.path ||
                  (item.path !== "/" && location.pathname.startsWith(item.path.split("/").slice(0, 2).join("/")));
              return (
                <div
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={clsx(
                    "flex items-center gap-[10px] px-3 py-[9px] rounded-xl cursor-pointer transition-all duration-150 text-[13px] font-medium relative",
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
                  <span className="w-5 flex items-center justify-center">
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
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
        ))}
      </nav>

      {/* User */}
      <div
        className="flex items-center gap-[10px] px-[14px] py-3"
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
  );
}
