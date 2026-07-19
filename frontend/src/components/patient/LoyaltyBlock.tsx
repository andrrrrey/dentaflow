import { useState } from "react";
import { Gift, KeyRound, Plus, Copy } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import toast from "react-hot-toast";
import {
  useLoyaltyLedger,
  useAwardLoyaltyPoints,
  useCreateReferralCode,
  useLoyaltyConfig,
} from "../../api/loyalty";

const cardStyle = {
  background: "rgba(255,255,255,0.65)",
  backdropFilter: "blur(18px)",
  border: "1px solid rgba(255,255,255,0.85)",
  boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
};

const ACTION_LABEL: Record<string, string> = {
  purchase: "Покупка",
  referral: "Рекомендация",
  review: "Отзыв",
  manual: "Корректировка",
};

function fmtDate(d: string) {
  try { return format(parseISO(d), "d MMM yyyy", { locale: ru }); } catch { return d; }
}

export default function LoyaltyBlock({ patientId, referralCode }: {
  patientId: string;
  referralCode?: string | null;
}) {
  const { data, isLoading } = useLoyaltyLedger(patientId);
  const { data: config } = useLoyaltyConfig();
  const awardMut = useAwardLoyaltyPoints(patientId);
  const codeMut = useCreateReferralCode(patientId);
  const [code, setCode] = useState<string | null>(referralCode ?? null);

  function handleGenerateCode() {
    codeMut.mutate(undefined, {
      onSuccess: (res) => setCode(res.referral_code),
      onError: () => toast.error("Не удалось получить код"),
    });
  }

  function handleAward(actionType: "referral" | "review" | "manual") {
    const defaults: Record<string, number> = {
      referral: config?.referral_points ?? 300,
      review: config?.review_points ?? 200,
      manual: 0,
    };
    const raw = window.prompt(
      actionType === "referral" ? "Баллы за рекомендацию:"
        : actionType === "review" ? "Баллы за отзыв:"
        : "Корректировка баланса (можно отрицательное число):",
      String(defaults[actionType]),
    );
    if (raw === null) return;
    const points = Number(raw);
    if (!Number.isFinite(points) || points === 0) {
      toast.error("Введите ненулевое число");
      return;
    }
    const description = window.prompt("Комментарий (необязательно):", "") ?? undefined;
    awardMut.mutate({ action_type: actionType, points, description }, {
      onSuccess: () => toast.success("Баллы начислены"),
      onError: () => toast.error("Не удалось начислить"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Balance + referral code */}
      <div className="rounded-[18px] p-5 flex flex-col gap-4" style={cardStyle}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[13px] flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}>
              <Gift size={20} className="text-white" />
            </div>
            <div>
              <div className="text-[22px] font-extrabold leading-none">
                {isLoading ? "…" : (data?.balance ?? 0).toLocaleString("ru-RU")}
              </div>
              <div className="text-[11.5px] text-text-muted mt-1">баллов на счету</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <span className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Реф. код</span>
              {code ? (
                <button
                  onClick={() => { navigator.clipboard?.writeText(code); toast.success("Код скопирован"); }}
                  className="flex items-center gap-1.5 text-[15px] font-mono font-bold text-accent2 bg-transparent border-none cursor-pointer p-0"
                  title="Скопировать">
                  {code} <Copy size={13} />
                </button>
              ) : (
                <button onClick={handleGenerateCode} disabled={codeMut.isPending}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-accent2 bg-transparent border-none cursor-pointer p-0">
                  <KeyRound size={13} /> Сгенерировать
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Manual award actions */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-[rgba(91,76,245,0.08)]">
          <button onClick={() => handleAward("referral")}
            className="flex items-center gap-1.5 px-3 py-[7px] rounded-[10px] text-[12px] font-semibold border-none cursor-pointer"
            style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
            <Plus size={12} /> За рекомендацию
          </button>
          <button onClick={() => handleAward("review")}
            className="flex items-center gap-1.5 px-3 py-[7px] rounded-[10px] text-[12px] font-semibold border-none cursor-pointer"
            style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
            <Plus size={12} /> За отзыв
          </button>
          <button onClick={() => handleAward("manual")}
            className="flex items-center gap-1.5 px-3 py-[7px] rounded-[10px] text-[12px] font-semibold border-none cursor-pointer"
            style={{ background: "rgba(91,76,245,0.06)", color: "#8a8fa5" }}>
            <Plus size={12} /> Корректировка
          </button>
        </div>
      </div>

      {/* Ledger */}
      <div className="rounded-[18px] p-5 flex flex-col gap-2" style={cardStyle}>
        <h3 className="text-[14px] font-bold mb-1">История начислений</h3>
        {isLoading && <div className="text-[13px] text-text-muted py-3 text-center">Загрузка...</div>}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <div className="text-[13px] text-text-muted py-3 text-center">Пока нет начислений</div>
        )}
        {(data?.items ?? []).map((t) => (
          <div key={t.id} className="flex items-center justify-between py-[7px] border-b border-[rgba(91,76,245,0.05)] last:border-0">
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-text-main">
                {ACTION_LABEL[t.action_type] ?? t.action_type}
              </div>
              <div className="text-[11px] text-text-muted truncate">
                {fmtDate(t.created_at)}{t.description ? ` · ${t.description}` : ""}
              </div>
            </div>
            <span className={`text-[14px] font-bold flex-shrink-0 ${t.points >= 0 ? "text-accent3" : "text-danger"}`}>
              {t.points >= 0 ? "+" : ""}{t.points}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
