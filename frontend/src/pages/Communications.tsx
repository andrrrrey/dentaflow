import { useMemo } from "react";
import { useCommunications } from "../api/communications";
import { useCommunicationsStore } from "../store/communicationsStore";
import FeedFilters from "../components/communications/FeedFilters";
import {
  MessageCircle, Phone, PhoneMissed, Globe, Send,
  ArrowDownLeft, ArrowUpRight, Sparkles, Tag,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import type { CommunicationItem } from "../types";

/* ── channel helpers ── */

const channelIcon: Record<string, React.ReactNode> = {
  telegram: <MessageCircle size={15} className="text-[#229ED9]" />,
  novofon: <Phone size={15} className="text-[#00C9A7]" />,
  max: <Send size={15} className="text-[#5B4CF5]" />,
  site: <Globe size={15} className="text-[#3B7FED]" />,
};

const channelLabel: Record<string, string> = {
  telegram: "Telegram",
  novofon: "Телефония",
  max: "Max / VK",
  site: "Сайт",
};

const priorityStyles: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: "rgba(244,75,110,0.12)", text: "#c52048", label: "Срочный" },
  high: { bg: "rgba(245,166,35,0.12)", text: "#b87200", label: "Высокий" },
  normal: { bg: "rgba(91,76,245,0.08)", text: "#5B4CF5", label: "Обычный" },
  low: { bg: "rgba(0,0,0,0.05)", text: "#8a8fa5", label: "Низкий" },
};

const statusDot: Record<string, string> = {
  new: "#3B7FED",
  in_progress: "#F5A623",
  done: "#00C9A7",
};

function getPreview(item: CommunicationItem): string {
  if (item.type === "missed_call") return "Пропущенный звонок";
  if (item.type === "call" && item.duration_sec != null) {
    const m = Math.floor(item.duration_sec / 60);
    const s = item.duration_sec % 60;
    return item.content ? `[${m}:${String(s).padStart(2,"0")}] ${item.content}` : `Звонок (${m}:${String(s).padStart(2,"0")})`;
  }
  return item.content ?? "Нет содержания";
}

/* ── Card ── */

function RequestCard({ item }: { item: CommunicationItem }) {
  const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ru });
  const pr = priorityStyles[item.priority] ?? priorityStyles.normal;

  return (
    <div
      className="rounded-[18px] p-[16px_18px] flex flex-col gap-3"
      style={{
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0">
            {item.type === "missed_call"
              ? <PhoneMissed size={15} className="text-[#c52048]" />
              : (channelIcon[item.channel] ?? <MessageCircle size={15} className="text-text-muted" />)}
          </span>
          <span className="text-[13px] font-bold text-text-main truncate">
            {item.patient_name ?? "Новый контакт"}
          </span>
          {item.direction === "outbound"
            ? <ArrowUpRight size={12} className="text-text-muted flex-shrink-0" />
            : <ArrowDownLeft size={12} className="text-text-muted flex-shrink-0" />}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* status dot */}
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: statusDot[item.status] ?? "#ccc" }}
          />
          <span className="text-[10px] text-text-muted">{timeAgo}</span>
        </div>
      </div>

      {/* Channel + priority */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-text-muted">
          {channelLabel[item.channel] ?? item.channel}
          {item.type === "form" && " (форма)"}
        </span>
        <span
          className="px-[8px] py-[1px] rounded-full text-[10px] font-semibold"
          style={{ background: pr.bg, color: pr.text }}
        >
          {pr.label}
        </span>
      </div>

      {/* Content preview */}
      <p className="text-[12.5px] text-text-main leading-[1.5] line-clamp-3">
        {getPreview(item)}
      </p>

      {/* AI block */}
      {(item.ai_summary || item.ai_next_action || (item.ai_tags?.length ?? 0) > 0) && (
        <div
          className="rounded-[12px] p-[10px_14px] flex flex-col gap-2"
          style={{ background: "rgba(91,76,245,0.06)", border: "1px solid rgba(91,76,245,0.10)" }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent2">
            <Sparkles size={12} />
            ИИ-анализ
          </div>

          {item.ai_summary && (
            <p className="text-[12px] text-text-main leading-[1.4]">{item.ai_summary}</p>
          )}

          {item.ai_next_action && (
            <p className="text-[11.5px] font-semibold" style={{ color: "#5B4CF5" }}>
              → {item.ai_next_action}
            </p>
          )}

          {(item.ai_tags?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Tag size={10} className="text-text-muted" />
              {item.ai_tags!.map((tag) => (
                <span
                  key={tag}
                  className="px-[7px] py-[1px] rounded-full text-[10px] font-medium bg-[rgba(91,76,245,0.08)] text-[#5B4CF5]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page ── */

export default function Communications() {
  const { filters } = useCommunicationsStore();

  const { data, isLoading } = useCommunications({
    status: filters.status,
    channel: filters.channel,
    priority: filters.priority,
  });

  const items = data?.items ?? [];

  const statusCounts = useMemo(() => {
    const allItems = data?.items ?? [];
    const counts: Record<string, number> = { total: data?.total ?? 0, new: 0, in_progress: 0, done: 0 };
    if (!filters.status) {
      for (const item of allItems) {
        counts[item.status] = (counts[item.status] ?? 0) + 1;
      }
      counts.total = allItems.length;
    } else {
      counts.total = data?.total ?? 0;
      counts.new = data?.unread_count ?? 0;
    }
    return counts;
  }, [data, filters.status]);

  return (
    <div className="flex flex-col gap-4">
      <FeedFilters statusCounts={statusCounts} />

      {isLoading && (
        <div className="text-center py-12 text-text-muted text-[13px]">Загрузка...</div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-12 text-text-muted text-[13px]">Нет обращений</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item) => (
          <RequestCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
