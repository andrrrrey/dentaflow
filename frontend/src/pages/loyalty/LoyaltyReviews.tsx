import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import toast from "react-hot-toast";
import {
  useLoyaltyReviews,
  useApproveReview,
  useRejectReview,
  useLoyaltyConfig,
  type ReviewEntry,
} from "../../api/loyalty";

const cardStyle = {
  background: "rgba(255,255,255,0.65)",
  backdropFilter: "blur(18px)",
  border: "1px solid rgba(255,255,255,0.85)",
  boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
};

const STATUS_LABEL: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: "На проверке", color: "#F5A623", bg: "rgba(245,166,35,0.12)" },
  approved: { text: "Одобрен", color: "#00C9A7", bg: "rgba(0,201,167,0.12)" },
  rejected: { text: "Отклонён", color: "#f44b6e", bg: "rgba(244,75,110,0.12)" },
};

function fmtDate(d: string) {
  try { return format(parseISO(d), "d MMM yyyy, HH:mm", { locale: ru }); } catch { return d; }
}

export default function LoyaltyReviews() {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const { data: reviews, isLoading } = useLoyaltyReviews(filter === "all" ? undefined : filter);
  const { data: config } = useLoyaltyConfig();
  const approveMut = useApproveReview();
  const rejectMut = useRejectReview();
  const navigate = useNavigate();

  function handleApprove(r: ReviewEntry) {
    const def = config?.review_points ?? 200;
    const raw = window.prompt("Сколько баллов начислить за отзыв?", String(def));
    if (raw === null) return;
    const points = Number(raw);
    if (!Number.isFinite(points) || points <= 0) {
      toast.error("Введите положительное число");
      return;
    }
    approveMut.mutate({ id: r.id, points }, {
      onSuccess: () => toast.success(`Начислено ${points} баллов`),
      onError: () => toast.error("Не удалось одобрить"),
    });
  }

  function handleReject(r: ReviewEntry) {
    if (!window.confirm("Отклонить этот отзыв?")) return;
    rejectMut.mutate(r.id, {
      onSuccess: () => toast.success("Отзыв отклонён"),
      onError: () => toast.error("Не удалось отклонить"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-[2px] p-[3px] rounded-[11px] w-fit" style={{ background: "rgba(91,76,245,0.07)" }}>
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-4 py-[6px] rounded-[9px] text-[11.5px] font-semibold border-none cursor-pointer transition-all"
            style={filter === f ? { background: "#fff", color: "#5B4CF5", boxShadow: "0 1px 6px rgba(91,76,245,0.15)" } : { background: "transparent", color: "#8a8fa5" }}>
            {f === "pending" ? "На проверке" : f === "approved" ? "Одобренные" : f === "rejected" ? "Отклонённые" : "Все"}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center py-10 text-text-muted text-[13px]">Загрузка...</div>}
      {!isLoading && (reviews?.length ?? 0) === 0 && (
        <div className="text-center py-10 text-text-muted text-[13px]">Нет отзывов</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(reviews ?? []).map((r) => {
          const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.pending;
          return (
            <div key={r.id} className="rounded-[18px] overflow-hidden flex flex-col" style={cardStyle}>
              <a href={r.image_url} target="_blank" rel="noreferrer"
                className="block relative group" style={{ aspectRatio: "4 / 3", background: "rgba(91,76,245,0.05)" }}>
                <img src={r.image_url} alt="Отзыв" className="w-full h-full object-cover" />
                <span className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink size={14} className="text-white" />
                </span>
              </a>
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => r.patient_id && navigate(`/patients/${r.patient_id}`)}
                    disabled={!r.patient_id}
                    className="text-[13px] font-bold text-text-main hover:text-accent2 bg-transparent border-none cursor-pointer p-0 text-left disabled:cursor-default disabled:hover:text-text-main">
                    {r.patient_name ?? "Пациент не определён"}
                  </button>
                  <span className="px-2 py-[2px] rounded-full text-[10px] font-semibold"
                    style={{ color: st.color, background: st.bg }}>{st.text}</span>
                </div>
                <div className="text-[11px] text-text-muted">
                  {r.channel === "telegram" ? "Telegram" : r.channel === "max" ? "Max" : "—"} · {fmtDate(r.created_at)}
                </div>
                {r.status === "approved" && r.points_awarded != null && (
                  <div className="text-[12px] font-semibold text-accent3">Начислено {r.points_awarded} баллов</div>
                )}
                {r.status === "pending" && (
                  <div className="flex gap-2 pt-1 mt-auto">
                    <button onClick={() => handleApprove(r)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-[7px] rounded-[10px] text-[12px] font-bold text-white border-none cursor-pointer"
                      style={{ background: "linear-gradient(135deg,#00C9A7,#3B7FED)" }}>
                      <Check size={13} /> Одобрить
                    </button>
                    <button onClick={() => handleReject(r)}
                      className="flex items-center justify-center gap-1.5 px-3 py-[7px] rounded-[10px] text-[12px] font-semibold border-none cursor-pointer"
                      style={{ background: "rgba(244,75,110,0.08)", color: "#f44b6e" }}>
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
