import { useMemo } from "react";
import { useCommunications } from "../api/communications";
import { useCommunicationsStore } from "../store/communicationsStore";
import FeedFilters from "../components/communications/FeedFilters";
import FeedItem from "../components/communications/FeedItem";
import ChatPanel from "../components/communications/ChatPanel";
import type { CommunicationItem } from "../types";

export default function Communications() {
  const { filters, selectedId, setSelectedId } = useCommunicationsStore();

  const { data, isLoading } = useCommunications({
    status: filters.status,
    channel: filters.channel,
    priority: filters.priority,
  });

  const items = data?.items ?? [];

  const selectedItem: CommunicationItem | null = useMemo(() => {
    if (!selectedId) return null;
    return items.find((i) => i.id === selectedId) ?? null;
  }, [selectedId, items]);

  /* Counts for filter tabs */
  const statusCounts = useMemo(() => {
    // Use unfiltered data for counts — we always show total counts
    const allItems = data?.items ?? [];
    const counts: Record<string, number> = {
      total: data?.total ?? 0,
      new: 0,
      in_progress: 0,
      done: 0,
    };
    // When a status filter is active the query only returns that subset,
    // so we fall back to the unread_count from the response for "new".
    // For accurate tab counts we re-derive from the full list when no
    // status filter is applied.
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
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <FeedFilters statusCounts={statusCounts} />

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Feed list */}
        <div
          className="w-full md:w-[40%] flex-shrink-0 overflow-y-auto rounded-glass p-[10px_8px]"
          style={{
            background: "rgba(255,255,255,0.55)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
          }}
        >
          {isLoading && (
            <div className="text-center py-8 text-text-muted text-[13px]">
              Загрузка...
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="text-center py-8 text-text-muted text-[13px]">
              Нет сообщений
            </div>
          )}

          {items.map((item) => (
            <FeedItem
              key={item.id}
              item={item}
              isSelected={item.id === selectedId}
              onClick={() => setSelectedId(item.id)}
            />
          ))}
        </div>

        {/* Right: Chat panel */}
        <div
          className={`flex-1 min-w-0 ${
            selectedItem ? "hidden md:flex" : "hidden md:flex"
          } flex-col`}
        >
          {selectedItem ? (
            <ChatPanel
              item={selectedItem}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div
              className="flex-1 flex items-center justify-center rounded-glass"
              style={{
                background: "rgba(255,255,255,0.45)",
                backdropFilter: "blur(18px)",
                border: "1px solid rgba(255,255,255,0.85)",
                boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
              }}
            >
              <div className="text-center">
                <p className="text-text-muted text-[14px] font-medium">
                  Выберите сообщение
                </p>
                <p className="text-text-muted text-[12px] mt-1">
                  для просмотра деталей
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: full-screen chat overlay */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 md:hidden bg-surface p-4 overflow-y-auto">
          <ChatPanel
            item={selectedItem}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}
