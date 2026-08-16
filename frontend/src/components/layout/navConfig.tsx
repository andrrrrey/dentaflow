import {
  LayoutDashboard,
  CalendarDays,
  PhoneCall,
  ClipboardList,
  BarChart3,
  MessageSquare,
  MessageCircle,
  GitBranch,
  Users,
  UserCheck,
  BookOpen,
  FileBarChart,
  Settings,
  Megaphone,
  Gift,
  CheckSquare,
  Phone,
} from "lucide-react";
import type { ReactNode } from "react";

/* ---------- types ---------- */

export interface NavItem {
  label: string;
  icon: ReactNode;
  path: string;
  badge?: string;
  badgeColor?: "red" | "blue" | "green";
  hideForRoles?: string[];
}

export interface NavSection {
  items: NavItem[];
}

/* ---------- nav config ---------- */
/* Единый источник пунктов навигации: используется десктопным Sidebar и
   мобильным бургер-дровером (MobileDrawer). */

export const sections: NavSection[] = [
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
      { label: "Заявки", icon: <MessageSquare size={15} />, path: "/communications" },
      { label: "Коммуникация", icon: <MessageCircle size={15} />, path: "/chats" },
      { label: "Воронка", icon: <GitBranch size={15} />, path: "/pipeline" },
      { label: "Задачи", icon: <CheckSquare size={15} />, path: "/tasks" },
    ],
  },
  {
    items: [
      { label: "Маркетинг", icon: <Megaphone size={15} />, path: "/marketing/discounts" },
      { label: "Бонусная программа", icon: <Gift size={15} />, path: "/loyalty/settings" },
      { label: "Справочники", icon: <BookOpen size={15} />, path: "/directories" },
      { label: "Отчёты", icon: <FileBarChart size={15} />, path: "/reports", hideForRoles: ["admin"] },
      { label: "Сотрудники", icon: <Users size={15} />, path: "/staff", hideForRoles: ["admin"] },
      { label: "Настройки", icon: <Settings size={15} />, path: "/settings", hideForRoles: ["admin"] },
    ],
  },
  {
    items: [
      { label: "ИИ обзвон", icon: <Phone size={15} />, path: "/ai-calling", hideForRoles: ["admin", "marketer"] },
    ],
  },
];

/* ---------- badge colors ---------- */

export const badgeColorMap: Record<string, string> = {
  red: "bg-danger",
  blue: "bg-accent2",
  green: "bg-accent3",
};
