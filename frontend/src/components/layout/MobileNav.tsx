import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  BarChart3,
  MoreHorizontal,
  CheckSquare,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuthStore } from "../../store/authStore";

interface MobileNavItem {
  label: string;
  icon: ReactNode;
  path: string;
  hideForRoles?: string[];
}

const allItems: MobileNavItem[] = [
  { label: "\u041E\u0431\u0437\u043E\u0440", icon: <LayoutDashboard size={20} />, path: "/" },
  { label: "\u041A\u043E\u043C\u043C\u0443\u043D\u0438\u043A\u0430\u0446\u0438\u0438", icon: <MessageSquare size={20} />, path: "/communications" },
  { label: "\u0412\u043E\u0440\u043E\u043D\u043A\u0430", icon: <GitBranch size={20} />, path: "/pipeline" },
  { label: "\u0417\u0430\u0434\u0430\u0447\u0438", icon: <CheckSquare size={20} />, path: "/tasks" },
  { label: "\u0410\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0430", icon: <BarChart3 size={20} />, path: "/analytics", hideForRoles: ["admin"] },
  { label: "\u0415\u0449\u0451", icon: <MoreHorizontal size={20} />, path: "/more" },
];

export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const userRole = useAuthStore((s) => s.user?.role ?? "");
  const items = allItems.filter((item) => !item.hideForRoles || !item.hideForRoles.includes(userRole));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex items-center justify-around md:hidden z-[200]"
      style={{
        height: 60,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(20px)",
        borderTop: "1px solid var(--glass-border)",
        boxShadow: "0 -2px 16px rgba(120,140,180,0.12)",
      }}
    >
      {items.map((item) => {
        const active = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={clsx(
              "flex flex-col items-center gap-[2px] bg-transparent border-none cursor-pointer transition-colors duration-150 px-2 py-1",
              active ? "text-accent2" : "text-text-muted",
            )}
          >
            {item.icon}
            <span className="text-[10px] font-semibold">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
