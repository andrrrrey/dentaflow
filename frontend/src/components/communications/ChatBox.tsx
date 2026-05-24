import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { useCommunicationMessages, sendCommunicationReply } from "../../api/communications";

interface Props {
  communicationId: string;
  channel: string;
  botChatId: string | null;
}

export default function ChatBox({ communicationId, channel, botChatId }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useCommunicationMessages(communicationId);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await sendCommunicationReply(communicationId, trimmed);
      setText("");
      await queryClient.invalidateQueries({ queryKey: ["comm_messages", communicationId] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка отправки";
      setSendError(msg);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  const canReply = (channel === "telegram" || channel === "max") && !!botChatId;

  return (
    <div
      className="rounded-[16px] flex flex-col"
      style={{
        background: "rgba(255,255,255,0.80)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
        minHeight: 200,
        maxHeight: 420,
      }}
    >
      {/* Header */}
      <div className="px-[16px] py-[10px] border-b border-[rgba(91,76,245,0.08)] flex-shrink-0">
        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
          Переписка
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-[14px] py-[10px] flex flex-col gap-[8px]">
        {isLoading && (
          <div className="flex items-center justify-center py-4 text-text-muted">
            <Loader2 size={14} className="animate-spin mr-2" />
            <span className="text-[12px]">Загрузка...</span>
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <p className="text-[12px] text-text-muted text-center py-4">Нет сообщений</p>
        )}

        {messages.map((msg) => {
          const isInbound = msg.direction === "inbound";
          return (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[82%] ${isInbound ? "items-start self-start" : "items-end self-end"}`}
            >
              <div
                className="rounded-[12px] px-[12px] py-[8px]"
                style={
                  isInbound
                    ? { background: "rgba(59,127,237,0.09)" }
                    : { background: "rgba(91,76,245,0.10)" }
                }
              >
                {msg.sender_name && (
                  <p
                    className="text-[10px] font-semibold mb-1"
                    style={{ color: isInbound ? "#3B7FED" : "#5B4CF5" }}
                  >
                    {msg.sender_name}
                  </p>
                )}
                <p className="text-[13px] text-text-main leading-[1.5] whitespace-pre-wrap">
                  {msg.content}
                </p>
                <p className="text-[10px] text-text-muted mt-1">
                  {format(parseISO(msg.created_at), "HH:mm", { locale: ru })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {canReply && (
        <div className="flex-shrink-0 border-t border-[rgba(91,76,245,0.08)] px-[12px] py-[10px] flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать клиенту... (Ctrl+Enter)"
            rows={2}
            className="flex-1 resize-none rounded-[10px] px-[10px] py-[8px] text-[12.5px] border bg-white/60 text-text-main placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-[rgba(91,76,245,0.30)]"
            style={{ borderColor: "rgba(91,76,245,0.18)" }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="flex items-center justify-center gap-1.5 rounded-[10px] px-[14px] py-[8px] text-[12px] font-bold border-none cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed self-end"
            style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)", color: "#fff" }}
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
      )}

      {sendError && (
        <p className="text-[11px] text-[#c52048] px-[14px] pb-[8px]">{sendError}</p>
      )}

      {!canReply && (
        <div className="flex-shrink-0 px-[14px] py-[10px] border-t border-[rgba(91,76,245,0.08)]">
          <p className="text-[11.5px] text-text-muted">
            {!botChatId
              ? "Ответ недоступен — это обращение создано до обновления системы. Свяжитесь с клиентом напрямую по телефону."
              : "Ответ доступен только для каналов Telegram и Max"}
          </p>
        </div>
      )}
    </div>
  );
}
