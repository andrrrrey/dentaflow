import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  PhoneMissed,
  Clock,
  AlertTriangle,
  Bot,
  CheckCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useNotifications, type NotificationResponse } from "@/api/notifications";

/* ── Icon by notification type ─────────────────────────── */

function typeIcon(type: string | null) {
  switch (type) {
    case "missed_call":
      return <PhoneMissed size={14} className="text-danger" />;
    case "stale_lead":
      return <Clock size={14} className="text-warning" />;
    case "deal_stuck":
      return <AlertTriangle size={14} className="text-warning" />;
    case "ai_alert":
      return <Bot size={14} className="text-accent2" />;
    default:
      return <Bell size={14} className="text-text-muted" />;
  }
}

/* ── Single notification row ───────────────────────────── */

function NotificationRow({
  item,
  onRead,
  onNavigate,
}: {
  item: NotificationResponse;
  onRead: (id: string) => void;
  onNavigate: (link: string) => void;
}) {
  const timeAgo = formatDistanceToNow(new Date(item.created_at), {
    addSuffix: true,
    locale: ru,
  });

  return (
    <button
      onClick={() => {
        if (!item.is_read) onRead(item.id);
        if (item.link) onNavigate(item.link);
      }}
      className="w-full flex items-start gap-3 px-4 py-3 text-left border-none bg-transparent cursor-pointer transition-colors duration-100 hover:bg-[rgba(91,76,245,0.05)]"
      style={{
        background: item.is_read ? "transparent" : "rgba(91,76,245,0.03)",
      }}
    >
      {/* Icon */}
      <span className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg bg-[rgba(91,76,245,0.08)] flex items-center justify-center">
        {typeIcon(item.type)}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-main truncate">
            {item.title}
          </span>
          {!item.is_read && (
            <span
              className="flex-shrink-0 w-2 h-2 rounded-full bg-accent2"
            />
          )}
        </div>
        <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2 leading-[1.4]">
          {item.body}
        </p>
        <span className="text-[10px] text-text-muted/60 mt-1 block">
          {timeAgo}
        </span>
      </div>
    </button>
  );
}

/* ── NotificationBell ──────────────────────────────────── */

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data, markAsRead, markAllRead } = useNotifications();

  /* Close on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleNavigate = (link: string) => {
    setOpen(false);
    navigate(link);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-[10px] bg-[rgba(91,76,245,0.08)] border-none cursor-pointer flex items-center justify-center text-text-main transition-all duration-150 hover:bg-[rgba(91,76,245,0.15)] relative"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {data.unread_count > 0 && (
          <span
            className="absolute flex items-center justify-center rounded-full bg-danger text-white font-bold"
            style={{
              top: 2,
              right: 2,
              fontSize: 9,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              border: "2px solid #fff",
              lineHeight: 1,
            }}
          >
            {data.unread_count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-[360px] rounded-2xl shadow-xl overflow-hidden z-[100]"
          style={{
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(24px)",
            border: "1px solid var(--glass-border)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
            <span className="text-sm font-bold text-text-main">
              Уведомления
            </span>
            {data.unread_count > 0 && (
              <button
                onClick={() => markAllRead()}
                className="flex items-center gap-1 text-[11px] font-medium text-accent2 bg-transparent border-none cursor-pointer hover:underline"
              >
                <CheckCheck size={13} />
                Отметить все прочитанным
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-[var(--glass-border)]">
            {data.items.length === 0 ? (
              <p className="text-center text-xs text-text-muted py-8">
                Нет уведомлений
              </p>
            ) : (
              data.items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onRead={markAsRead}
                  onNavigate={handleNavigate}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
