import { useState } from "react";
import { useCommunications } from "../api/communications";
import { useCommunicationsStore } from "../store/communicationsStore";
import FeedFilters from "../components/communications/FeedFilters";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import {
  MessageCircle, Phone, PhoneMissed, Globe, Send,
  ArrowDownLeft, ArrowUpRight, Sparkles, Tag, GitBranch,
  CheckCircle2, Trash2,
} from "lucide-react";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import type { CommunicationItem } from "../types";
import { useMemo } from "react";

/* ── helpers ── */

const channelIcon: Record<string, React.ReactNode> = {
  telegram: <MessageCircle size={14} className="text-[#229ED9]" />,
  novofon: <Phone size={14} className="text-[#00C9A7]" />,
  max: <Send size={14} className="text-[#5B4CF5]" />,
  site: <Globe size={14} className="text-[#3B7FED]" />,
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
    return item.content
      ? `[${m}:${String(s).padStart(2, "0")}] ${item.content}`
      : `Звонок (${m}:${String(s).padStart(2, "0")})`;
  }
  return item.content ?? "Нет содержания";
}

/* ── Left: compact list row ── */

function RequestRow({
  item,
  active,
  onClick,
  onDelete,
}: {
  item: CommunicationItem;
  active: boolean;
  onClick: () => void;
  onDelete: (id: string) => void;
}) {
  const pr = priorityStyles[item.priority] ?? priorityStyles.normal;
  const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ru });

  return (
    <div
      onClick={onClick}
      className="flex flex-col gap-[6px] px-[14px] py-[12px] cursor-pointer border-b border-[rgba(91,76,245,0.05)] transition-colors"
      style={
        active
          ? { background: "rgba(91,76,245,0.08)" }
          : { background: "transparent" }
      }
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(91,76,245,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* top row */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex-shrink-0">
          {item.type === "missed_call"
            ? <PhoneMissed size={13} className="text-[#c52048]" />
            : (channelIcon[item.channel] ?? <MessageCircle size={13} className="text-text-muted" />)}
        </span>
        <span className="text-[12.5px] font-bold text-text-main truncate flex-1">
          {item.patient_name ?? "Новый контакт"}
        </span>
        <span
          className="w-[7px] h-[7px] rounded-full flex-shrink-0"
          style={{ background: statusDot[item.status] ?? "#ccc" }}
        />
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          className="flex-shrink-0 p-[3px] rounded-md hover:bg-[rgba(244,75,110,0.12)] text-text-muted hover:text-[#c52048] transition-colors border-none cursor-pointer bg-transparent"
          title="Удалить"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* channel + priority + time */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10.5px] text-text-muted">
          {channelLabel[item.channel] ?? item.channel}
          {item.direction === "outbound"
            ? <ArrowUpRight size={10} className="inline ml-0.5 text-text-muted" />
            : <ArrowDownLeft size={10} className="inline ml-0.5 text-text-muted" />}
        </span>
        <span
          className="px-[6px] py-[1px] rounded-full text-[9.5px] font-semibold"
          style={{ background: pr.bg, color: pr.text }}
        >
          {pr.label}
        </span>
        <span className="text-[10px] text-text-muted ml-auto">{timeAgo}</span>
      </div>

      {/* preview */}
      <p className="text-[11.5px] text-text-muted leading-[1.4] line-clamp-2">
        {getPreview(item)}
      </p>
    </div>
  );
}

/* ── Right: detail panel ── */

function DetailPanel({ item }: { item: CommunicationItem }) {
  const queryClient = useQueryClient();
  const [added, setAdded] = useState(false);

  const addLeadMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/deals/", {
        title: `Лид: ${item.patient_name ?? "Новый контакт"} (${channelLabel[item.channel] ?? item.channel})`,
        patient_id: item.patient_id ?? undefined,
        patient_name: item.patient_name ?? undefined,
        stage: "new",
        source_channel: item.channel,
      });
      return data;
    },
    onSuccess: () => {
      setAdded(true);
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });

  const pr = priorityStyles[item.priority] ?? priorityStyles.normal;

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      {/* header */}
      <div
        className="rounded-[16px] p-[16px_18px] flex flex-col gap-3"
        style={{
          background: "rgba(255,255,255,0.80)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-shrink-0">
              {item.type === "missed_call"
                ? <PhoneMissed size={16} className="text-[#c52048]" />
                : (channelIcon[item.channel] ?? <MessageCircle size={16} className="text-text-muted" />)}
            </span>
            <span className="text-[15px] font-bold text-text-main truncate">
              {item.patient_name ?? "Новый контакт"}
            </span>
          </div>
          <span
            className="px-[9px] py-[2px] rounded-full text-[10.5px] font-semibold flex-shrink-0"
            style={{ background: pr.bg, color: pr.text }}
          >
            {pr.label}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-[11.5px] text-text-muted">
          <span>{channelLabel[item.channel] ?? item.channel}</span>
          <span>
            {format(parseISO(item.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
          </span>
        </div>

        <p className="text-[13px] text-text-main leading-[1.6]">{getPreview(item)}</p>
      </div>

      {/* AI analysis */}
      <div
        className="rounded-[16px] p-[16px_18px] flex flex-col gap-3"
        style={{
          background: "rgba(91,76,245,0.05)",
          border: "1px solid rgba(91,76,245,0.12)",
        }}
      >
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-accent2">
          <Sparkles size={13} />
          ИИ-анализ
        </div>

        {item.ai_summary ? (
          <p className="text-[13px] text-text-main leading-[1.5]">{item.ai_summary}</p>
        ) : (
          <p className="text-[12px] text-text-muted">Анализ недоступен</p>
        )}

        {item.ai_next_action && (
          <div
            className="rounded-[10px] px-[12px] py-[8px] text-[12px] font-semibold"
            style={{ background: "rgba(91,76,245,0.09)", color: "#5B4CF5" }}
          >
            → {item.ai_next_action}
          </div>
        )}

        {(item.ai_tags?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <Tag size={11} className="text-text-muted" />
            {item.ai_tags!.map((tag) => (
              <span
                key={tag}
                className="px-[8px] py-[1.5px] rounded-full text-[10.5px] font-medium bg-[rgba(91,76,245,0.08)] text-[#5B4CF5]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Add to pipeline CRM */}
      <button
        onClick={() => !added && addLeadMutation.mutate()}
        disabled={added || addLeadMutation.isPending}
        className="flex items-center justify-center gap-2 rounded-[14px] px-4 py-[12px] text-[13px] font-bold border-none cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        style={
          added
            ? { background: "rgba(0,201,167,0.12)", color: "#00c9a7" }
            : { background: "linear-gradient(135deg, #5B4CF5, #3B7FED)", color: "#fff" }
        }
      >
        {added ? (
          <>
            <CheckCircle2 size={15} />
            Добавлено в воронку
          </>
        ) : (
          <>
            <GitBranch size={15} />
            {addLeadMutation.isPending ? "Добавляем..." : "Добавить лид в воронку CRM"}
          </>
        )}
      </button>
    </div>
  );
}

/* ── Page ── */

export default function Communications() {
  const { filters } = useCommunicationsStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/communications/${id}`);
    },
    onSuccess: (_, id) => {
      if (selectedId === id) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["communications"] });
    },
  });

  const { data, isLoading } = useCommunications({
    status: filters.status,
    channel: filters.channel,
    priority: filters.priority,
  });

  const items = data?.items ?? [];
  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;

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
    <div className="flex flex-col gap-4 h-full">
      <FeedFilters statusCounts={statusCounts} />

      {isLoading && (
        <div className="text-center py-12 text-text-muted text-[13px]">Загрузка...</div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-12 text-text-muted text-[13px]">Нет обращений</div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 min-h-0" style={{ flex: 1 }}>
          {/* Left: requests list */}
          <div
            className="rounded-[18px] overflow-hidden flex flex-col"
            style={{
              background: "rgba(255,255,255,0.65)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
              maxHeight: "calc(100vh - 200px)",
              overflowY: "auto",
            }}
          >
            <div className="px-[14px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                Заявки · {items.length}
              </span>
            </div>
            {items.map((item) => (
              <RequestRow
                key={item.id}
                item={item}
                active={item.id === selectedId}
                onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>

          {/* Right: AI analysis panel */}
          <div>
            {selected ? (
              <DetailPanel key={selected.id} item={selected} />
            ) : (
              <div
                className="rounded-[18px] h-full flex flex-col items-center justify-center gap-3"
                style={{
                  background: "rgba(255,255,255,0.50)",
                  backdropFilter: "blur(18px)",
                  border: "1px solid rgba(255,255,255,0.85)",
                  minHeight: 300,
                }}
              >
                <Sparkles size={28} className="text-accent2 opacity-40" />
                <p className="text-[13px] text-text-muted">Выберите заявку для просмотра анализа</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
