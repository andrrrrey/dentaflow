import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, Send, ArrowDownLeft, ArrowUpRight,
  GitBranch, CheckCircle2, XCircle, Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useCommunications } from "../api/communications";
import { api } from "../api/client";
import ChatBox from "../components/communications/ChatBox";
import type { CommunicationItem } from "../types";

/* ── helpers ── */

const CHAT_CHANNELS = ["telegram", "max"];

const channelIcon: Record<string, React.ReactNode> = {
  telegram: <MessageCircle size={14} className="text-[#229ED9]" />,
  max: <Send size={14} className="text-[#5B4CF5]" />,
};

const channelLabel: Record<string, string> = {
  telegram: "Telegram",
  max: "Max / VK",
};

function extractNameFromContent(content: string | null | undefined): string | null {
  if (!content) return null;
  const m = content.match(/Имя:\s*([^,\n.]+)/);
  return m ? m[1].trim() : null;
}

function getDisplayName(item: CommunicationItem): string {
  if (item.patient_name) return item.patient_name;
  return extractNameFromContent(item.content) ?? "Новый контакт";
}

function extractPhoneFromContent(content: string | null | undefined): string | null {
  if (!content) return null;
  const m = content.match(/(?:тел|Телефон)[.:\s]+([+\d][\d\s\-().]{6,})/i);
  return m ? m[1].trim().replace(/[.\s]+$/, "") : null;
}

function buildDealTitle(item: CommunicationItem): string {
  const name = getDisplayName(item);
  const phone = extractPhoneFromContent(item.content);
  return phone ? `Лид: ${name}, ${phone}` : `Лид: ${name} (${channelLabel[item.channel] ?? item.channel})`;
}

function buildDealNotes(item: CommunicationItem): string | undefined {
  const parts: string[] = [];
  if (item.content) parts.push(item.content);
  if (item.ai_summary) parts.push(`ИИ-анализ: ${item.ai_summary}`);
  if (item.ai_next_action) parts.push(`Рекомендация: ${item.ai_next_action}`);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function isUnread(item: CommunicationItem): boolean {
  return item.status === "new" && item.direction === "inbound";
}

/* ── chat list row ── */

function ChatRow({ item, active, unread, onClick, onDelete }: {
  item: CommunicationItem;
  active: boolean;
  unread: boolean;
  onClick: () => void;
  onDelete: (id: string) => void;
}) {
  const timeAgo = formatDistanceToNow(new Date(item.last_message_at ?? item.created_at), { addSuffix: true, locale: ru });
  return (
    <div
      onClick={onClick}
      className="group flex flex-col gap-[5px] px-[14px] py-[11px] cursor-pointer border-b border-[rgba(91,76,245,0.05)] transition-colors"
      style={active ? { background: "rgba(91,76,245,0.08)" } : undefined}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(91,76,245,0.04)"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex-shrink-0">{channelIcon[item.channel] ?? <MessageCircle size={13} className="text-text-muted" />}</span>
        <span className={`text-[12.5px] truncate flex-1 ${unread ? "font-extrabold text-text-main" : "font-semibold text-text-main"}`}>
          {getDisplayName(item)}
        </span>
        {unread && <span className="w-[8px] h-[8px] rounded-full flex-shrink-0 bg-[#3B7FED]" />}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          className="flex-shrink-0 p-[3px] rounded-md hover:bg-[rgba(244,75,110,0.12)] text-text-muted hover:text-[#c52048] transition-colors border-none cursor-pointer bg-transparent opacity-0 group-hover:opacity-100"
          title="Удалить"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] text-text-muted">
          {channelLabel[item.channel] ?? item.channel}
          {item.direction === "outbound"
            ? <ArrowUpRight size={10} className="inline ml-0.5 text-text-muted" />
            : <ArrowDownLeft size={10} className="inline ml-0.5 text-text-muted" />}
        </span>
        <span className="text-[10px] text-text-muted ml-auto">{timeAgo}</span>
      </div>
      <p className={`text-[11.5px] leading-[1.4] line-clamp-1 ${unread ? "text-text-main font-medium" : "text-text-muted"}`}>
        {item.content ?? "Нет содержания"}
      </p>
    </div>
  );
}

/* ── action bar above the chat ── */

function ChatActions({ item }: { item: CommunicationItem }) {
  const queryClient = useQueryClient();

  const addLeadMutation = useMutation({
    mutationFn: async () => {
      await api.post("/deals/", {
        title: buildDealTitle(item),
        patient_id: item.patient_id ?? undefined,
        patient_name: item.patient_name ?? undefined,
        stage: "new",
        source_channel: item.channel,
        notes: buildDealNotes(item),
      });
      await api.patch(`/communications/${item.id}`, { status: "in_progress" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["communications"] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => { await api.patch(`/communications/${item.id}`, { status: "done" }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-chats-count"] });
    },
  });

  return (
    <div
      className="flex items-center gap-2 px-[14px] py-[10px] rounded-[14px] flex-shrink-0"
      style={{ background: "rgba(255,255,255,0.80)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 4px 18px rgba(120,140,180,0.10)" }}
    >
      <span className="flex-shrink-0">{channelIcon[item.channel] ?? <MessageCircle size={15} className="text-text-muted" />}</span>
      <span className="text-[14px] font-bold text-text-main truncate">{getDisplayName(item)}</span>
      <span className="text-[11px] text-text-muted hidden sm:inline">· {channelLabel[item.channel] ?? item.channel}</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => addLeadMutation.mutate()}
          disabled={addLeadMutation.isPending}
          className="flex items-center gap-1.5 rounded-[10px] px-3 py-[7px] text-[12px] font-bold border-none cursor-pointer transition-all disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)", color: "#fff" }}
          title="Добавить лид в воронку CRM"
        >
          <GitBranch size={14} />
          <span className="hidden md:inline">{addLeadMutation.isPending ? "Добавляем..." : "В воронку"}</span>
        </button>
        {item.status === "done" ? (
          <span className="flex items-center gap-1.5 rounded-[10px] px-3 py-[7px] text-[12px] font-bold" style={{ background: "rgba(0,201,167,0.12)", color: "#00c9a7" }}>
            <CheckCircle2 size={14} /><span className="hidden md:inline">Закрыта</span>
          </span>
        ) : (
          <button
            onClick={() => closeMutation.mutate()}
            disabled={closeMutation.isPending}
            className="flex items-center gap-1.5 rounded-[10px] px-3 py-[7px] text-[12px] font-bold border cursor-pointer transition-all disabled:opacity-60"
            style={{ background: "rgba(255,255,255,0.7)", borderColor: "rgba(197,32,72,0.25)", color: "#c52048" }}
            title="Закрыть заявку"
          >
            <XCircle size={14} /><span className="hidden md:inline">Закрыть</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Page ── */

export default function Chats() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useCommunications();

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => { await api.patch(`/communications/${id}`, { status: "in_progress" }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-chats-count"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/communications/${id}`); },
    onSuccess: (_, id) => {
      if (selectedId === id) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["communications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-chats-count"] });
    },
  });

  // Chats only, unread first then most recent.
  const chats = useMemo(() => {
    const items = (data?.items ?? []).filter((i) => CHAT_CHANNELS.includes(i.channel));
    return items.sort((a, b) => {
      const ua = isUnread(a) ? 1 : 0;
      const ub = isUnread(b) ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return (
        new Date(b.last_message_at ?? b.created_at).getTime() -
        new Date(a.last_message_at ?? a.created_at).getTime()
      );
    });
  }, [data]);

  const unreadCount = useMemo(() => chats.filter(isUnread).length, [chats]);

  const selected = selectedId ? chats.find((i) => i.id === selectedId) ?? null : null;

  // Переход из уведомления: /chats?comm=<id> — авто-выбор треда
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const comm = searchParams.get("comm");
    if (comm && chats.some((i) => i.id === comm)) {
      setSelectedId(comm);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, chats.length]);

  function handleSelect(item: CommunicationItem) {
    setSelectedId(item.id);
    if (isUnread(item)) markReadMutation.mutate(item.id);
  }

  return (
    <div className="flex flex-col h-full">
      {isLoading ? (
        <div className="text-center py-12 text-text-muted text-[13px]">Загрузка...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 flex-1 min-h-0">
          {/* Left: chat list */}
          <div
            className="rounded-[18px] overflow-hidden flex flex-col min-h-0"
            style={{
              background: "rgba(255,255,255,0.65)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
            }}
          >
            <div className="px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)] flex-shrink-0 flex items-center gap-2">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Чаты · {chats.length}</span>
              {unreadCount > 0 && (
                <span
                  className="ml-auto inline-flex items-center gap-1 text-white text-[10px] font-bold px-[7px] py-[2px] rounded-full bg-danger"
                  title={`${unreadCount} непрочитанных`}
                >
                  {unreadCount} новых
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {chats.length === 0 ? (
                <p className="text-center text-[12px] text-text-muted py-8">Нет чатов</p>
              ) : (
                chats.map((item) => (
                  <ChatRow
                    key={item.id}
                    item={item}
                    active={item.id === selectedId}
                    unread={isUnread(item)}
                    onClick={() => handleSelect(item)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right: chat area */}
          <div className="flex flex-col gap-3 min-h-0">
            {selected ? (
              <>
                <ChatActions item={selected} />
                <div className="flex-1 min-h-0">
                  <ChatBox
                    key={selected.id}
                    communicationId={selected.id}
                    channel={selected.channel}
                    botChatId={selected.bot_chat_id}
                    fill
                  />
                </div>
              </>
            ) : (
              <div
                className="rounded-[18px] h-full flex flex-col items-center justify-center gap-3"
                style={{ background: "rgba(255,255,255,0.50)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.85)", minHeight: 300 }}
              >
                <MessageCircle size={28} className="text-accent2 opacity-40" />
                <p className="text-[13px] text-text-muted">Выберите чат, чтобы начать общение</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
