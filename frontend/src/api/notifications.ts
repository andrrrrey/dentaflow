import { useState, useCallback } from "react";

/* ── Types ─────────────────────────────────────────────── */

export interface NotificationResponse {
  id: string;
  user_id: string | null;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationResponse[];
  total: number;
  unread_count: number;
}

/* ── Helpers ───────────────────────────────────────────── */

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function nid(n: number): string {
  return `b1000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
}

const USER_ID = "a0000000-0000-4000-a000-000000000001";

/* ── Mock notifications ───────────────────────────────── */

const INITIAL_NOTIFICATIONS: NotificationResponse[] = [
  {
    id: nid(0), user_id: USER_ID,
    type: "missed_call",
    title: "Пропущенный звонок",
    body: "Пациент Иванов Сергей звонил 10 минут назад, не дозвонился",
    link: "/communications",
    is_read: false, created_at: hoursAgo(0.2),
  },
  {
    id: nid(1), user_id: USER_ID,
    type: "stale_lead",
    title: "Лид без движения 3 дня",
    body: "Сделка «Имплантация зубов» — Петрова М. не обрабатывалась 3 дня",
    link: "/deals",
    is_read: false, created_at: hoursAgo(2),
  },
  {
    id: nid(2), user_id: USER_ID,
    type: "ai_alert",
    title: "AI: негативный тон в чате",
    body: "В переписке с Кузнецовым А. обнаружен негативный настрой, рекомендуется перезвонить",
    link: "/communications",
    is_read: false, created_at: hoursAgo(5),
  },
  {
    id: nid(3), user_id: USER_ID,
    type: "deal_stuck",
    title: "Сделка застряла",
    body: "Сделка «Ортодонтия — брекеты» на этапе «Контакт» уже 5 дней",
    link: "/deals",
    is_read: false, created_at: daysAgo(1),
  },
  {
    id: nid(4), user_id: USER_ID,
    type: "missed_call",
    title: "Пропущенный звонок",
    body: "Пациент Сидорова Е. звонила вчера в 15:30",
    link: "/communications",
    is_read: true, created_at: daysAgo(1),
  },
  {
    id: nid(5), user_id: USER_ID,
    type: "stale_lead",
    title: "Лид без движения 5 дней",
    body: "Сделка «Протезирование» — Васильева О. ожидает ответа",
    link: "/deals",
    is_read: true, created_at: daysAgo(2),
  },
  {
    id: nid(6), user_id: USER_ID,
    type: "ai_alert",
    title: "AI: рекомендация по допродаже",
    body: "Пациенту Козлову А. можно предложить отбеливание после установки виниров",
    link: "/patients",
    is_read: true, created_at: daysAgo(3),
  },
  {
    id: nid(7), user_id: USER_ID,
    type: "deal_stuck",
    title: "Сделка застряла",
    body: "Сделка «Отбеливание» — Морозов Д. на этапе «Контакт» 4 дня без активности",
    link: "/deals",
    is_read: true, created_at: daysAgo(4),
  },
];

/* ── Hook ──────────────────────────────────────────────── */

export function useNotifications() {
  const [notifications, setNotifications] =
    useState<NotificationResponse[]>(INITIAL_NOTIFICATIONS);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, []);

  const data: NotificationListResponse = {
    items: notifications,
    total: notifications.length,
    unread_count: unreadCount,
  };

  return { data, markAsRead, markAllRead };
}
