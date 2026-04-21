import {
  MessageCircle,
  Phone,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { CommunicationBrief } from "../../api/patients";

interface CommHistoryProps {
  communications: CommunicationBrief[];
}

const channelIcon: Record<string, React.ReactNode> = {
  telegram: <MessageCircle size={16} className="text-[#229ED9]" />,
  novofon: <Phone size={16} className="text-[#00C9A7]" />,
  max: <Send size={16} className="text-[#5B4CF5]" />,
};

const channelLabel: Record<string, string> = {
  telegram: "Telegram",
  novofon: "Телефония",
  max: "Max/VK",
};

const statusDot: Record<string, string> = {
  done: "bg-[#00C9A7]",
  in_progress: "bg-[#F5A623]",
  new: "bg-[#3B7FED]",
};

const statusLabel: Record<string, string> = {
  done: "Завершено",
  in_progress: "В работе",
  new: "Новое",
};

export default function CommHistory({ communications }: CommHistoryProps) {
  const sorted = [...communications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[19px] top-0 bottom-0 w-px bg-[rgba(91,76,245,0.12)]" />

      <div className="space-y-1">
        {sorted.map((comm) => (
          <div key={comm.id} className="relative pl-[46px] py-3">
            {/* Timeline dot */}
            <div
              className="absolute left-[14px] top-[18px] w-[11px] h-[11px] rounded-full border-2 border-white"
              style={{
                background:
                  comm.direction === "inbound"
                    ? "#3B7FED"
                    : "#00C9A7",
                boxShadow: "0 0 0 3px rgba(91,76,245,0.08)",
              }}
            />

            <div
              className="rounded-glass p-[14px_16px]"
              style={{
                background: "rgba(255,255,255,0.65)",
                backdropFilter: "blur(18px)",
                border: "1px solid rgba(255,255,255,0.85)",
                boxShadow: "0 2px 12px rgba(120,140,180,0.1)",
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="flex-shrink-0">
                  {channelIcon[comm.channel] ?? <MessageCircle size={16} className="text-text-muted" />}
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  {channelLabel[comm.channel] ?? comm.channel}
                </span>
                {comm.direction === "outbound" ? (
                  <ArrowUpRight size={12} className="text-text-muted" />
                ) : (
                  <ArrowDownLeft size={12} className="text-text-muted" />
                )}
                <span className="text-[10px] text-text-muted">
                  {comm.direction === "outbound" ? "Исходящее" : "Входящее"}
                </span>

                <span className="ml-auto flex items-center gap-1.5">
                  <span className={`w-[6px] h-[6px] rounded-full ${statusDot[comm.status] ?? "bg-gray-300"}`} />
                  <span className="text-[10px] text-text-muted">
                    {statusLabel[comm.status] ?? comm.status}
                  </span>
                </span>
              </div>

              {/* Content */}
              {comm.content && (
                <p className="text-[12.5px] text-text-main leading-relaxed mb-1.5">
                  {comm.content}
                </p>
              )}

              {/* Date */}
              <div className="text-[10px] text-text-muted">
                {format(new Date(comm.created_at), "dd MMM yyyy, HH:mm", { locale: ru })}
              </div>
            </div>
          </div>
        ))}

        {sorted.length === 0 && (
          <div className="text-center py-8 text-text-muted text-[13px] pl-[46px]">
            Нет истории коммуникаций
          </div>
        )}
      </div>
    </div>
  );
}
