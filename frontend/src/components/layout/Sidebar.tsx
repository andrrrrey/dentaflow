import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard,
  CalendarDays,
  PhoneCall,
  ClipboardList,
  RefreshCw,
  BarChart3,
  MessageSquare,
  GitBranch,
  Megaphone,
  Users,
  Settings,
  Gift,
} from "lucide-react";
import type { ReactNode } from "react";

/* ---------- types ---------- */

interface NavItem {
  label: string;
  icon: ReactNode;
  path: string;
  badge?: string;
  badgeColor?: "red" | "blue" | "green";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  currentUser: { name: string; role: string };
}

/* ---------- nav config ---------- */

const sections: NavSection[] = [
  {
    title: "\u041C\u041E\u0414\u0423\u041B\u042C 1",
    items: [
      { label: "\u041E\u0431\u0437\u043E\u0440", icon: <LayoutDashboard size={15} />, path: "/" },
      { label: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435", icon: <CalendarDays size={15} />, path: "/schedule" },
      { label: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u0437\u0432\u043E\u043D\u043A\u043E\u0432", icon: <PhoneCall size={15} />, path: "/calls" },
      { label: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432", icon: <ClipboardList size={15} />, path: "/scripts" },
      { label: "\u0420\u0435\u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u044F", icon: <RefreshCw size={15} />, path: "/reactivation" },
      { label: "\u0410\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0430", icon: <BarChart3 size={15} />, path: "/analytics" },
    ],
  },
  {
    title: "\u041C\u041E\u0414\u0423\u041B\u042C 2",
    items: [
      {
        label: "\u041A\u043E\u043C\u043C\u0443\u043D\u0438\u043A\u0430\u0446\u0438\u0438",
        icon: <MessageSquare size={15} />,
        path: "/communications",
        badge: "12",
        badgeColor: "red",
      },
      {
        label: "\u0412\u043E\u0440\u043E\u043D\u043A\u0430",
        icon: <GitBranch size={15} />,
        path: "/pipeline",
        badge: "24",
        badgeColor: "blue",
      },
      { label: "\u041C\u0430\u0440\u043A\u0435\u0442\u0438\u043D\u0433", icon: <Megaphone size={15} />, path: "/marketing" },
    ],
  },
  {
    title: "\u0421\u0418\u0421\u0422\u0415\u041C\u0410",
    items: [
      { label: "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0438", icon: <Users size={15} />, path: "/staff" },
      { label: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438", icon: <Settings size={15} />, path: "/settings" },
      { label: "\u0420\u0435\u0444\u0435\u0440\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430", icon: <Gift size={15} />, path: "/referral" },
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

export default function Sidebar({ currentUser }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const initials = currentUser.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();

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
            {"\u0423\u043C\u043D\u0430\u044F \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u043A\u043B\u0438\u043D\u0438\u043A\u0438"}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-[14px] px-[10px]">
        {sections.map((section) => (
          <div key={section.title} className="mb-5">
            <div className="text-[10px] font-bold tracking-[1.3px] text-text-muted uppercase px-[10px] mb-[5px]">
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = location.pathname === item.path;
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
        <div
          className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #5B4CF5, #3B7FED)",
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-bold truncate">
            {currentUser.name}
          </div>
          <div className="text-[11px] text-text-muted">{currentUser.role}</div>
        </div>
      </div>
    </aside>
  );
}
