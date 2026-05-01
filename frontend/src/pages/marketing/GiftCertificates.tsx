import { useState } from "react";
import { Plus, Trash2, Copy, CheckCircle2, X, Gift } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  useCertificates, useCreateCertificate, useUpdateCertificate, useDeleteCertificate,
  type CertificateCreate, type CertificateResponse,
} from "../../api/marketing";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "rgba(0,201,167,0.12)", text: "#00c9a7", label: "Активен" },
  used: { bg: "rgba(91,76,245,0.10)", text: "#5B4CF5", label: "Использован" },
  expired: { bg: "rgba(0,0,0,0.06)", text: "#8a8fa5", label: "Истёк" },
  cancelled: { bg: "rgba(244,75,110,0.10)", text: "#f44b6e", label: "Отменён" },
};

function fmtDate(d: string) {
  try { return format(parseISO(d), "d MMM yyyy", { locale: ru }); } catch { return d; }
}

const inputCls = "rounded-[10px] px-3 py-[8px] text-[12.5px] text-text-main outline-none w-full";
const inputStyle = { background: "rgba(255,255,255,0.80)", border: "1px solid rgba(91,76,245,0.15)" };

const today = () => format(new Date(), "yyyy-MM-dd");
const plusYear = () => format(new Date(Date.now() + 365 * 86400_000), "yyyy-MM-dd");

const EMPTY: CertificateCreate = { amount: 5000, valid_from: today(), valid_to: plusYear() };

function CertModal({
  onSave,
  onClose,
}: {
  onSave: (data: CertificateCreate) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CertificateCreate>(EMPTY);
  const set = (k: keyof CertificateCreate, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-[480px] rounded-[24px] p-6 flex flex-col gap-4"
        style={{ background: "rgba(255,255,255,0.97)", boxShadow: "0 20px 60px rgba(91,76,245,0.20)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">Новый сертификат</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main border-none bg-transparent cursor-pointer"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Номинал ₽ *</label>
            <input type="number" value={form.amount} onChange={(e) => set("amount", Number(e.target.value))} className={inputCls} style={inputStyle} min={100} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Код (авто если пусто)</label>
            <input value={form.code ?? ""} onChange={(e) => set("code", e.target.value || undefined)} className={inputCls} style={inputStyle} placeholder="CERT-XXXX" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Действует с *</label>
            <input type="date" value={form.valid_from} onChange={(e) => set("valid_from", e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Действует по *</label>
            <input type="date" value={form.valid_to} onChange={(e) => set("valid_to", e.target.value)} className={inputCls} style={inputStyle} />
          </div>

          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Получатель</label>
            <input value={form.recipient_name ?? ""} onChange={(e) => set("recipient_name", e.target.value || undefined)} className={inputCls} style={inputStyle} placeholder="Имя получателя" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Телефон получателя</label>
            <input value={form.recipient_phone ?? ""} onChange={(e) => set("recipient_phone", e.target.value || undefined)} className={inputCls} style={inputStyle} placeholder="+7..." />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Email получателя</label>
            <input value={form.recipient_email ?? ""} onChange={(e) => set("recipient_email", e.target.value || undefined)} className={inputCls} style={inputStyle} placeholder="email@example.com" />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Куплен кем</label>
            <input value={form.purchased_by ?? ""} onChange={(e) => set("purchased_by", e.target.value || undefined)} className={inputCls} style={inputStyle} placeholder="Имя или контакт покупателя" />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Примечание</label>
            <textarea value={form.note ?? ""} onChange={(e) => set("note", e.target.value || undefined)}
              className={inputCls + " resize-none"} style={inputStyle} rows={2} />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={() => onSave(form)} disabled={!form.amount || !form.valid_from || !form.valid_to}
            className="px-6 py-[10px] rounded-[12px] text-[13px] font-bold text-white border-none cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}>
            Создать
          </button>
          <button onClick={onClose} className="px-6 py-[10px] rounded-[12px] text-[13px] font-semibold border-none cursor-pointer"
            style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function CertCard({ cert, onUpdate, onDelete }: { cert: CertificateResponse; onUpdate: (id: string, body: object) => void; onDelete: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const st = STATUS_STYLE[cert.status] ?? STATUS_STYLE.active;
  const usedPct = Math.round(((cert.amount - cert.remaining_amount) / cert.amount) * 100);

  function copyCode() {
    navigator.clipboard.writeText(cert.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-[18px] p-[16px_18px] flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.75)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 4px 18px rgba(120,140,180,0.10)" }}>
      {/* Top */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gift size={16} className="text-accent2 flex-shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-extrabold text-text-main font-mono">{cert.code}</span>
              <button onClick={copyCode} className="border-none bg-transparent cursor-pointer p-0" title="Скопировать код">
                {copied ? <CheckCircle2 size={13} className="text-[#00C9A7]" /> : <Copy size={13} className="text-text-muted" />}
              </button>
            </div>
            {cert.recipient_name && <div className="text-[11px] text-text-muted">→ {cert.recipient_name}</div>}
          </div>
        </div>
        <span className="px-[9px] py-[2px] rounded-full text-[10.5px] font-bold flex-shrink-0" style={{ background: st.bg, color: st.text }}>
          {st.label}
        </span>
      </div>

      {/* Amount bar */}
      <div>
        <div className="flex justify-between text-[11px] text-text-muted mb-1">
          <span>Остаток</span>
          <span className="font-bold text-text-main">{cert.remaining_amount.toLocaleString("ru-RU")} / {cert.amount.toLocaleString("ru-RU")} ₽</span>
        </div>
        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "rgba(91,76,245,0.10)" }}>
          <div className="h-full rounded-full" style={{ width: `${100 - usedPct}%`, background: "linear-gradient(90deg,#5B4CF5,#3B7FED)" }} />
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-2 text-[11px] text-text-muted">
        <span>Срок: {fmtDate(cert.valid_from)} — {fmtDate(cert.valid_to)}</span>
        {cert.purchased_by && <span>Куплен: {cert.purchased_by}</span>}
        {cert.recipient_phone && <span>Тел: {cert.recipient_phone}</span>}
        {cert.note && <span className="col-span-2 italic">{cert.note}</span>}
      </div>

      {/* Actions */}
      {cert.status === "active" && (
        <div className="flex gap-2">
          <button onClick={() => onUpdate(cert.id, { status: "cancelled" })}
            className="flex-1 py-[6px] rounded-[10px] text-[11.5px] font-semibold border-none cursor-pointer"
            style={{ background: "rgba(244,75,110,0.08)", color: "#f44b6e" }}>
            Отменить
          </button>
          <button onClick={() => onUpdate(cert.id, { status: "used", remaining_amount: 0 })}
            className="flex-1 py-[6px] rounded-[10px] text-[11.5px] font-semibold border-none cursor-pointer"
            style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
            Погасить
          </button>
        </div>
      )}
      {cert.status !== "active" && (
        <button onClick={() => { if (confirm("Удалить сертификат?")) onDelete(cert.id); }}
          className="flex items-center justify-center gap-1 py-[6px] rounded-[10px] text-[11.5px] font-semibold border-none cursor-pointer"
          style={{ background: "rgba(244,75,110,0.06)", color: "#f44b6e" }}>
          <Trash2 size={12} /> Удалить
        </button>
      )}
    </div>
  );
}

export default function GiftCertificates() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data, isLoading } = useCertificates(statusFilter || undefined);
  const createMut = useCreateCertificate();
  const updateMut = useUpdateCertificate();
  const deleteMut = useDeleteCertificate();

  const [showModal, setShowModal] = useState(false);
  const items = data?.items ?? [];

  const stats = {
    total: data?.total ?? 0,
    active: items.filter((c) => c.status === "active").length,
    totalValue: items.filter((c) => c.status === "active").reduce((s, c) => s + c.remaining_amount, 0),
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Активных", value: String(stats.active) },
          { label: "Всего", value: String(stats.total) },
          { label: "Остаток на активных", value: `${stats.totalValue.toLocaleString("ru-RU")} ₽` },
        ].map((s) => (
          <div key={s.label} className="rounded-[16px] p-[12px_16px]"
            style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 4px 18px rgba(120,140,180,0.08)" }}>
            <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">{s.label}</div>
            <div className="text-[20px] font-extrabold text-text-main mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-[2px] p-[3px] rounded-[11px]" style={{ background: "rgba(91,76,245,0.07)" }}>
          {[["", "Все"], ["active", "Активные"], ["used", "Использованные"], ["expired", "Истекшие"], ["cancelled", "Отменённые"]].map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className="px-3 py-[6px] rounded-[9px] text-[11px] font-semibold border-none cursor-pointer transition-all"
              style={statusFilter === k ? { background: "#fff", color: "#5B4CF5", boxShadow: "0 1px 6px rgba(91,76,245,0.15)" } : { background: "transparent", color: "#8a8fa5" }}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-[9px] rounded-[12px] text-[13px] font-bold text-white border-none cursor-pointer"
          style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}>
          <Plus size={14} /> Новый сертификат
        </button>
      </div>

      {isLoading && <div className="text-center py-12 text-text-muted text-[13px]">Загрузка...</div>}
      {!isLoading && items.length === 0 && <div className="text-center py-12 text-text-muted text-[13px]">Нет сертификатов</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((cert) => (
          <CertCard key={cert.id} cert={cert}
            onUpdate={(id, body) => updateMut.mutate({ id, ...body })}
            onDelete={(id) => deleteMut.mutate(id)}
          />
        ))}
      </div>

      {showModal && (
        <CertModal
          onSave={(data) => createMut.mutate(data, { onSuccess: () => setShowModal(false) })}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
