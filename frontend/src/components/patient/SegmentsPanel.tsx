import { RefreshCw, Download, ChevronRight, Loader2, Lock, AlertTriangle, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import {
  useSegments,
  useRecomputeSegment,
  useResetSegment,
  downloadSegmentExcel,
  type Segment,
} from "../../api/segments";

interface Props {
  onOpen: (key: string) => void;
}

const statusLabel: Record<string, string> = {
  idle: "Не рассчитан",
  queued: "В очереди…",
  running: "Идёт анализ…",
  done: "Готово",
  error: "Ошибка",
};

function SegmentCard({
  seg,
  onOpen,
  onRecompute,
  onReset,
}: {
  seg: Segment;
  onOpen: (key: string) => void;
  onRecompute: (key: string) => void;
  onReset: (key: string) => void;
}) {
  const busy = seg.status === "queued" || seg.status === "running";
  const isManual = seg.kind === "manual";

  return (
    <div
      className="rounded-[16px] p-[18px] flex flex-col gap-3"
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(91,76,245,0.12)",
        boxShadow: "0 4px 18px rgba(91,76,245,0.08)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[14px] font-bold text-text-main flex items-center gap-1.5">
            {isManual && <Lock size={13} className="text-text-muted flex-shrink-0" />}
            {seg.name}
          </span>
          {seg.description && (
            <span className="text-[11px] text-text-muted leading-snug">{seg.description}</span>
          )}
        </div>
        <span
          className="text-[20px] font-extrabold flex-shrink-0"
          style={{ color: "#5B4CF5" }}
        >
          {seg.member_count}
        </span>
      </div>

      {/* Status / progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          {busy && <Loader2 size={12} className="animate-spin" />}
          {seg.status === "error" && <AlertTriangle size={12} className="text-red-500" />}
          <span className={seg.status === "error" ? "text-red-500" : ""}>
            {statusLabel[seg.status] ?? seg.status}
            {busy && seg.total > 0
              ? ` — обработано ${seg.processed} из ${seg.total} (${seg.progress}%)`
              : ""}
          </span>
          {!busy && seg.computed_at && (
            <span className="ml-auto">
              обновлено{" "}
              {formatDistanceToNow(new Date(seg.computed_at), {
                addSuffix: true,
                locale: ru,
              })}
            </span>
          )}
        </div>
        {seg.status === "error" && seg.error && (
          <span className="text-[11px] text-red-500 leading-snug">{seg.error}</span>
        )}
        {busy && (
          <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "rgba(91,76,245,0.1)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${seg.progress}%`, background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {!isManual && (
          <button
            onClick={() => onRecompute(seg.key)}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-[7px] rounded-[10px] border-none cursor-pointer text-[12px] font-semibold disabled:opacity-50"
            style={{ background: "rgba(91,76,245,0.10)", color: "#5B4CF5" }}
          >
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
            Обновить
          </button>
        )}
        {!isManual && busy && (
          <button
            onClick={() => onReset(seg.key)}
            title="Сбросить зависший расчёт и разблокировать кнопку «Обновить»"
            className="flex items-center gap-1.5 px-3 py-[7px] rounded-[10px] border-none cursor-pointer text-[12px] font-semibold"
            style={{ background: "rgba(239,68,68,0.10)", color: "#ef4444" }}
          >
            <RotateCcw size={12} />
            Сбросить
          </button>
        )}
        <button
          onClick={() => onOpen(seg.key)}
          className="flex items-center gap-1 px-3 py-[7px] rounded-[10px] border-none cursor-pointer text-[12px] font-semibold"
          style={{ background: "rgba(91,76,245,0.10)", color: "#5B4CF5" }}
        >
          Открыть <ChevronRight size={13} />
        </button>
        <button
          onClick={() => downloadSegmentExcel(seg.key, `${seg.key}.xlsx`)}
          disabled={seg.member_count === 0}
          className="flex items-center gap-1.5 px-3 py-[7px] rounded-[10px] border-none cursor-pointer text-[12px] font-semibold disabled:opacity-40"
          style={{ background: "rgba(0,201,167,0.12)", color: "#00a98e" }}
        >
          <Download size={12} />
          Excel
        </button>
      </div>
    </div>
  );
}

export default function SegmentsPanel({ onOpen }: Props) {
  const { data, isLoading } = useSegments();
  const recompute = useRecomputeSegment();
  const reset = useResetSegment();
  const segments = data?.items ?? [];

  return (
    <div
      className="rounded-[18px] p-[20px] flex flex-col gap-4"
      style={{
        background: "rgba(255,255,255,0.90)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(91,76,245,0.12)",
        boxShadow: "0 4px 20px rgba(91,76,245,0.10)",
      }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-bold text-text-main">Списки и аналитика базы</span>
        <span className="text-[11px] text-text-muted">
          Анализ выполняется в фоне и сохраняется — повторно по тем же пациентам не пересчитывается. Нажмите «Обновить» для пересчёта.
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-text-muted text-[13px]">Загрузка…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {segments.map((seg) => (
            <SegmentCard
              key={seg.key}
              seg={seg}
              onOpen={onOpen}
              onRecompute={(k) => recompute.mutate(k)}
              onReset={(k) => reset.mutate(k)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
