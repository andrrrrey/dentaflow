import clsx from "clsx";
import {
  MessageCircle,
  Phone,
  PhoneMissed,
  Globe,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import type { CommunicationItem } from "../../types";

interface Props {
  item: CommunicationItem;
  isSelected: boolean;
  onClick: () => void;
}

const channelIcon: Record<string, React.ReactNode> = {
  telegram: <MessageCircle size={16} className="text-[#229ED9]" />,
  novofon: <Phone size={16} className="text-[#00C9A7]" />,
  max: <Send size={16} className="text-[#5B4CF5]" />,
  site: <Globe size={16} className="text-[#3B7FED]" />,
  manual: <MessageCircle size={16} className="text-text-muted" />,
};

const channelLabel: Record<string, string> = {
  telegram: "Telegram",
  novofon: "Телефония",
  max: "Max/VK",
  site: "Сайт",
  manual: "Вручную",
};

const priorityPill: Record<string, { bg: string; text: string; label: string }> = {
  urgent: {
    bg: "bg-[rgba(244,75,110,0.12)]",
    text: "text-[#c52048]",
    label: "Срочный",
  },
  high: {
    bg: "bg-[rgba(245,166,35,0.12)]",
    text: "text-[#b87200]",
    label: "Высокий",
  },
};

const statusDot: Record<string, string> = {
  new: "bg-[#3B7FED]",
  in_progress: "bg-[#F5A623]",
  done: "bg-[#00C9A7]",
  ignored: "bg-gray-300",
};

function getPreviewText(item: CommunicationItem): string {
  if (item.type === "missed_call") return "Пропущенный звонок";
  if (item.type === "call" && item.duration_sec != null) {
    const min = Math.floor(item.duration_sec / 60);
    const sec = item.duration_sec % 60;
    const dur = `${min}:${sec.toString().padStart(2, "0")}`;
    return item.content
      ? `[${dur}] ${item.content}`
      : `Звонок (${dur})`;
  }
  return item.content ?? "Без содержания";
}

function getUnansweredMinutes(item: CommunicationItem): number | null {
  if (item.status !== "new" || item.direction !== "inbound") return null;
  const created = new Date(item.created_at).getTime();
  const diff = Date.now() - created;
  return Math.floor(diff / 60_000);
}

export default function FeedItem({ item, isSelected, onClick }: Props) {
  const unansweredMin = getUnansweredMinutes(item);
  const timeAgo = formatDistanceToNow(new Date(item.created_at), {
    addSuffix: true,
    locale: ru,
  });

  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full text-left p-[12px_14px] rounded-[14px] transition-all duration-150 cursor-pointer border-none mb-1.5",
        isSelected
          ? "ring-1 ring-accent2/30"
          : "hover:bg-[rgba(91,76,245,0.04)]",
      )}
      style={
        isSelected
          ? {
              background: "rgba(91,76,245,0.07)",
            }
          : { background: "transparent" }
      }
    >
      <div className="flex items-start gap-3">
        {/* Channel icon */}
        <div className="mt-0.5 flex-shrink-0">
          {item.type === "missed_call"
            ? <PhoneMissed size={16} className="text-[#c52048]" />
            : channelIcon[item.channel]}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top row: name + time */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[13px] font-bold text-text-primary truncate">
                {item.patient_name ?? "Новый контакт"}
              </span>
              {item.direction === "outbound" ? (
                <ArrowUpRight size={12} className="text-text-muted flex-shrink-0" />
              ) : (
                <ArrowDownLeft size={12} className="text-text-muted flex-shrink-0" />
              )}
              <span
                className={clsx(
                  "w-[6px] h-[6px] rounded-full flex-shrink-0",
                  statusDot[item.status],
                )}
              />
            </div>
            <span className="text-[10px] text-text-muted whitespace-nowrap flex-shrink-0">
              {timeAgo}
            </span>
          </div>

          {/* Channel label */}
          <div className="text-[10px] text-text-muted mb-1">
            {channelLabel[item.channel]}
            {item.type === "form" && " (форма)"}
          </div>

          {/* Preview text */}
          <p className="text-[12px] text-text-secondary truncate leading-[1.4] mb-1.5">
            {getPreviewText(item)}
          </p>

          {/* Bottom row: pills + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Priority pill */}
            {(item.priority === "urgent" || item.priority === "high") && (
              <span
                className={clsx(
                  "inline-block px-[7px] py-[1px] rounded-full text-[10px] font-semibold",
                  priorityPill[item.priority].bg,
                  priorityPill[item.priority].text,
                )}
              >
                {priorityPill[item.priority].label}
              </span>
            )}

            {/* Unanswered badge */}
            {unansweredMin !== null && unansweredMin > 5 && (
              <span className="inline-block px-[7px] py-[1px] rounded-full text-[10px] font-semibold bg-[rgba(244,75,110,0.1)] text-[#c52048]">
                Без ответа {unansweredMin} мин
              </span>
            )}

            {/* AI tags */}
            {item.ai_tags?.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="inline-block px-[7px] py-[1px] rounded-full text-[10px] font-medium bg-[rgba(91,76,245,0.08)] text-[#5B4CF5]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}
