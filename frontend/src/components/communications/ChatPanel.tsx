import { useState } from "react";
import clsx from "clsx";
import {
  MessageCircle,
  Phone,
  PhoneMissed,
  Globe,
  Send,
  Sparkles,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  User,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { CommunicationItem } from "../../types";
import Button from "../ui/Button";
import { getAiSuggestion } from "../../api/ai";

interface Props {
  item: CommunicationItem;
  onClose: () => void;
}

const channelIcon: Record<string, React.ReactNode> = {
  telegram: <MessageCircle size={18} className="text-[#229ED9]" />,
  novofon: <Phone size={18} className="text-[#00C9A7]" />,
  max: <Send size={18} className="text-[#5B4CF5]" />,
  site: <Globe size={18} className="text-[#3B7FED]" />,
  manual: <MessageCircle size={18} className="text-text-muted" />,
};

const channelLabel: Record<string, string> = {
  telegram: "Telegram",
  novofon: "Телефония",
  max: "Max/VK",
  site: "Сайт",
  manual: "Вручную",
};

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: "Новое", color: "text-[#3B7FED]" },
  in_progress: { label: "В работе", color: "text-[#F5A623]" },
  done: { label: "Закрыто", color: "text-[#00C9A7]" },
  ignored: { label: "Проигнорировано", color: "text-gray-400" },
};

function formatDuration(sec: number): string {
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}:${s.toString().padStart(2, "0")}`;
}

export default function ChatPanel({ item, onClose }: Props) {
  const [replyText, setReplyText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const status = statusLabels[item.status];

  async function handleGetSuggestions() {
    setSuggestionsLoading(true);
    setSuggestionsError(false);
    try {
      const result = await getAiSuggestion({
        channel: item.channel,
        patient_name: item.patient_name ?? undefined,
        last_message: item.content ?? "",
        history: [],
      });
      setSuggestions(result);
    } catch {
      setSuggestionsError(true);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="rounded-glass p-[14px_18px] mb-3 flex-shrink-0"
        style={{
          background: "rgba(255,255,255,0.65)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 4px 20px rgba(120,140,180,0.18)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {channelIcon[item.channel]}
            <h3 className="text-[15px] font-extrabold text-text-primary">
              {item.patient_name ?? "Новый контакт"}
            </h3>
            <span className={clsx("text-[11px] font-semibold", status.color)}>
              {status.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[rgba(0,0,0,0.05)] cursor-pointer border-none bg-transparent"
          >
            <X size={18} className="text-text-muted" />
          </button>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            {item.direction === "outbound" ? (
              <ArrowUpRight size={12} />
            ) : (
              <ArrowDownLeft size={12} />
            )}
            {item.direction === "inbound" ? "Входящее" : "Исходящее"}
          </span>
          <span>{channelLabel[item.channel]}</span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {format(new Date(item.created_at), "d MMM, HH:mm", { locale: ru })}
          </span>
          {item.assigned_to_name && (
            <span className="flex items-center gap-1">
              <User size={12} />
              {item.assigned_to_name}
            </span>
          )}
        </div>
      </div>

      {/* Message / Call content */}
      <div
        className="rounded-glass p-[16px_18px] mb-3 flex-1 overflow-y-auto"
        style={{
          background: "rgba(255,255,255,0.65)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 4px 20px rgba(120,140,180,0.18)",
        }}
      >
        {/* Call details */}
        {(item.type === "call" || item.type === "missed_call") && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[rgba(0,0,0,0.06)]">
            {item.type === "missed_call" ? (
              <PhoneMissed size={16} className="text-[#c52048]" />
            ) : (
              <Phone size={16} className="text-[#00C9A7]" />
            )}
            <span className="text-[12px] font-semibold">
              {item.type === "missed_call"
                ? "Пропущенный звонок"
                : `Звонок (${formatDuration(item.duration_sec ?? 0)})`}
            </span>
          </div>
        )}

        {/* Content */}
        {item.content && (
          <div
            className={clsx(
              "rounded-[12px] p-3 mb-4 max-w-[85%]",
              item.direction === "inbound"
                ? "bg-[rgba(59,127,237,0.08)] mr-auto"
                : "bg-[rgba(0,201,167,0.08)] ml-auto",
            )}
          >
            <p className="text-[13px] text-text-primary leading-[1.5]">
              {item.content}
            </p>
            <span className="text-[10px] text-text-muted mt-1 block">
              {format(new Date(item.created_at), "HH:mm", { locale: ru })}
            </span>
          </div>
        )}

        {/* AI Summary */}
        {item.ai_summary && (
          <div
            className="rounded-[12px] p-3 mt-4"
            style={{
              background: "rgba(91,76,245,0.05)",
              border: "1px solid rgba(91,76,245,0.12)",
            }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={14} className="text-accent2" />
              <span className="text-[11px] font-bold text-accent2">
                AI-анализ
              </span>
            </div>
            <p className="text-[12px] text-text-secondary leading-[1.5] mb-2">
              {item.ai_summary}
            </p>
            {item.ai_next_action && (
              <div className="mt-2 pt-2 border-t border-[rgba(91,76,245,0.1)]">
                <span className="text-[10px] font-semibold text-accent2">
                  Рекомендация:
                </span>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  {item.ai_next_action}
                </p>
              </div>
            )}
            {item.ai_tags && item.ai_tags.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {item.ai_tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block px-[7px] py-[2px] rounded-full text-[10px] font-medium bg-[rgba(91,76,245,0.1)] text-[#5B4CF5]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Suggested replies + reply input */}
      {item.status !== "done" && (
        <div
          className="rounded-glass p-[14px_18px] flex-shrink-0"
          style={{
            background: "rgba(255,255,255,0.65)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 20px rgba(120,140,180,0.18)",
          }}
        >
          {/* AI suggestions */}
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={12} className="text-accent2" />
              <span className="text-[10px] font-semibold text-accent2">
                Подсказки ИИ
              </span>
              {suggestions.length === 0 && !suggestionsLoading && (
                <button
                  onClick={handleGetSuggestions}
                  className="ml-auto text-[10px] font-semibold text-accent2 bg-[rgba(91,76,245,0.08)] hover:bg-[rgba(91,76,245,0.15)] px-2 py-[3px] rounded-[8px] border-none cursor-pointer transition-colors"
                >
                  Получить подсказку
                </button>
              )}
            </div>
            {suggestionsLoading && (
              <div className="flex items-center gap-2 py-2 text-[11px] text-text-muted">
                <Loader2 size={12} className="animate-spin" />
                ИИ генерирует подсказки...
              </div>
            )}
            {suggestionsError && (
              <div className="text-[11px] text-[#F44B6E] py-1">
                Не удалось получить подсказку. <button onClick={handleGetSuggestions} className="underline cursor-pointer bg-transparent border-none text-[#F44B6E]">Повторить</button>
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {suggestions.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => setReplyText(reply)}
                    className="text-left p-2 rounded-[10px] text-[11px] text-text-secondary hover:bg-[rgba(91,76,245,0.06)] transition-colors duration-150 cursor-pointer border-none bg-[rgba(91,76,245,0.03)] leading-[1.4]"
                  >
                    {reply}
                  </button>
                ))}
                <button
                  onClick={() => { setSuggestions([]); handleGetSuggestions(); }}
                  className="text-[10px] text-text-muted hover:text-accent2 bg-transparent border-none cursor-pointer text-left pt-1 transition-colors"
                >
                  Обновить подсказки
                </button>
              </div>
            )}
          </div>

          {/* Reply textarea */}
          <div className="flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Написать ответ..."
              rows={2}
              className="flex-1 resize-none rounded-[10px] p-2.5 text-[12px] border bg-white/50 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent2/30"
              style={{ borderColor: "rgba(91,76,245,0.18)" }}
            />
            <div className="flex flex-col gap-1.5">
              <Button
                size="sm"
                disabled={!replyText.trim()}
                onClick={() => setReplyText("")}
              >
                <Send size={14} className="mr-1" />
                Отправить
              </Button>
            </div>
          </div>

          {/* Status actions */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[rgba(0,0,0,0.06)]">
            <span className="text-[10px] text-text-muted mr-1">Статус:</span>
            {item.status === "new" && (
              <Button size="sm" variant="secondary">
                Взять в работу
              </Button>
            )}
            {(item.status === "new" || item.status === "in_progress") && (
              <Button size="sm" variant="ghost">
                Закрыть
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
