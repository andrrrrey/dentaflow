import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User, ChevronLeft, ChevronRight, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import Pill from "../components/ui/Pill";
import { usePatients, type PatientFilters } from "../api/patients";
import { useSyncSchedule } from "../api/schedule";

const PAGE_SIZE = 20;

const channelLabel: Record<string, string> = {
  telegram: "Telegram",
  site: "Сайт",
  call: "Звонок",
  max: "Max/VK",
  referral: "Реферал",
};

function ltvColor(score: number | null): "green" | "yellow" | "red" | "blue" {
  if (score === null) return "blue";
  if (score >= 70) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

function formatRevenue(v: number): string {
  if (v === 0) return "0 ₽";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".", ",") + " млн ₽";
  return v.toLocaleString("ru-RU") + " ₽";
}

const inputCls = "rounded-[10px] px-3 py-[7px] text-[12.5px] text-text-main outline-none w-full";
const inputStyle = {
  background: "rgba(255,255,255,0.80)",
  border: "1px solid rgba(91,76,245,0.15)",
};

export default function Patients() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();
  const syncMutation = useSyncSchedule();

  const [filters, setFilters] = useState<PatientFilters>({});
  const [draft, setDraft] = useState<PatientFilters>({});

  const activeFilters: PatientFilters = { ...filters, search: search || undefined };
  const { data, isLoading } = usePatients(activeFilters, page, PAGE_SIZE);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const appliedCount = Object.values(filters).filter((v) => v !== undefined && v !== "").length;

  function handleSearch(v: string) { setSearch(v); setPage(1); }
  function applyFilters() { setFilters(draft); setPage(1); setShowFilters(false); }
  function resetFilters() { setDraft({}); setFilters({}); setPage(1); }

  function set(key: keyof PatientFilters, val: string | number | undefined) {
    setDraft((prev) => ({ ...prev, [key]: val === "" ? undefined : val }));
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Search + toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 px-4 py-[10px] rounded-[14px] flex-1"
          style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 4px 20px rgba(120,140,180,0.12)" }}>
          <Search size={16} className="text-text-muted flex-shrink-0" />
          <input type="text" placeholder="Поиск по имени, телефону, email..." value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-text-main placeholder:text-text-muted" />
          <span className="text-[11px] text-text-muted flex-shrink-0">{data ? `${total} пациентов` : ""}</span>
        </div>

        {/* Filter button */}
        <button onClick={() => { setDraft(filters); setShowFilters((v) => !v); }}
          className="flex items-center gap-[6px] px-4 py-[10px] rounded-[14px] border-none cursor-pointer transition-colors flex-shrink-0 text-[12px] font-semibold"
          style={{ background: appliedCount > 0 ? "rgba(91,76,245,0.15)" : "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
          <SlidersHorizontal size={14} />
          Фильтр{appliedCount > 0 ? ` (${appliedCount})` : ""}
        </button>

        {/* Sync */}
        <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
          className="flex items-center gap-[6px] px-3 py-[10px] rounded-[14px] border-none cursor-pointer transition-colors flex-shrink-0 text-[11px] font-semibold disabled:opacity-50"
          style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
          <RefreshCw size={13} className={syncMutation.isPending ? "animate-spin" : ""} />
          {syncMutation.isPending ? "Запрос..." : syncMutation.isSuccess ? "✓" : "Синхр."}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-[18px] p-[20px] flex flex-col gap-5"
          style={{ background: "rgba(255,255,255,0.90)", backdropFilter: "blur(18px)", border: "1px solid rgba(91,76,245,0.12)", boxShadow: "0 4px 20px rgba(91,76,245,0.10)" }}>

          <div className="flex items-center justify-between">
            <span className="text-[14px] font-bold text-text-main">Фильтры</span>
            <button onClick={() => setShowFilters(false)} className="text-text-muted hover:text-text-main border-none bg-transparent cursor-pointer"><X size={16} /></button>
          </div>

          {/* Row 1: simple selects */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Пол</label>
              <select value={draft.gender ?? ""} onChange={(e) => set("gender", e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">Все</option>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Источник</label>
              <select value={draft.source_channel ?? ""} onChange={(e) => set("source_channel", e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">Все</option>
                {Object.entries(channelLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Тип пациента</label>
              <select value={draft.patient_type ?? ""} onChange={(e) => set("patient_type", e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">Все</option>
                <option value="new">Новые пациенты</option>
                <option value="regular">Постоянные пациенты</option>
                <option value="refused">Отказавшиеся</option>
                <option value="potential">Потенциальные</option>
                <option value="other">Остальные</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Визиты</label>
              <select value={draft.visited ?? ""} onChange={(e) => set("visited", e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">Все</option>
                <option value="visited">Посетили</option>
                <option value="not_visited">Не посетили</option>
              </select>
            </div>
          </div>

          {/* Row 2: numeric ranges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Сумма продаж, ₽</label>
              <div className="flex gap-2 items-center">
                <input type="number" placeholder="от" value={draft.revenue_min ?? ""} onChange={(e) => set("revenue_min", e.target.value ? Number(e.target.value) : undefined)} className={inputCls} style={inputStyle} />
                <span className="text-text-muted text-[12px] flex-shrink-0">—</span>
                <input type="number" placeholder="до" value={draft.revenue_max ?? ""} onChange={(e) => set("revenue_max", e.target.value ? Number(e.target.value) : undefined)} className={inputCls} style={inputStyle} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Кол-во визитов</label>
              <div className="flex gap-2 items-center">
                <input type="number" placeholder="от" value={draft.visits_min ?? ""} onChange={(e) => set("visits_min", e.target.value ? Number(e.target.value) : undefined)} className={inputCls} style={inputStyle} />
                <span className="text-text-muted text-[12px] flex-shrink-0">—</span>
                <input type="number" placeholder="до" value={draft.visits_max ?? ""} onChange={(e) => set("visits_max", e.target.value ? Number(e.target.value) : undefined)} className={inputCls} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Row 3: date ranges */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">День рождения</label>
              <div className="flex gap-2 items-center">
                <input type="date" value={draft.birth_date_from ?? ""} onChange={(e) => set("birth_date_from", e.target.value)} className={inputCls} style={inputStyle} />
                <span className="text-text-muted text-[12px] flex-shrink-0">—</span>
                <input type="date" value={draft.birth_date_to ?? ""} onChange={(e) => set("birth_date_to", e.target.value)} className={inputCls} style={inputStyle} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Последнее посещение</label>
              <div className="flex gap-2 items-center">
                <input type="date" value={draft.last_visit_from ?? ""} onChange={(e) => set("last_visit_from", e.target.value)} className={inputCls} style={inputStyle} />
                <span className="text-text-muted text-[12px] flex-shrink-0">—</span>
                <input type="date" value={draft.last_visit_to ?? ""} onChange={(e) => set("last_visit_to", e.target.value)} className={inputCls} style={inputStyle} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Добавлен в систему</label>
              <div className="flex gap-2 items-center">
                <input type="date" value={draft.created_from ?? ""} onChange={(e) => set("created_from", e.target.value)} className={inputCls} style={inputStyle} />
                <span className="text-text-muted text-[12px] flex-shrink-0">—</span>
                <input type="date" value={draft.created_to ?? ""} onChange={(e) => set("created_to", e.target.value)} className={inputCls} style={inputStyle} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={applyFilters} className="px-7 py-[10px] rounded-[12px] text-[13px] font-bold text-white border-none cursor-pointer"
              style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}>
              Применить
            </button>
            <button onClick={resetFilters} className="px-7 py-[10px] rounded-[12px] text-[13px] font-semibold border-none cursor-pointer"
              style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
              Сбросить
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-glass overflow-hidden"
        style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 4px 20px rgba(120,140,180,0.18)" }}>
        <div className="hidden md:grid grid-cols-[1fr_160px_100px_120px_80px_100px] gap-3 px-[18px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
          {["Пациент", "Телефон", "Источник", "Последний визит", "LTV", "Выручка"].map((h) => (
            <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {isLoading && <div className="text-center py-8 text-text-muted text-[13px]">Загрузка...</div>}
        {!isLoading && items.length === 0 && <div className="text-center py-8 text-text-muted text-[13px]">Пациенты не найдены</div>}

        {items.map((patient) => (
          <button key={patient.id} onClick={() => navigate(`/patients/${patient.id}`)}
            className="w-full text-left md:grid md:grid-cols-[1fr_160px_100px_120px_80px_100px] gap-3 px-[18px] py-[12px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors cursor-pointer bg-transparent border-x-0 border-t-0 flex flex-col md:flex-row md:items-center">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}>
                <User size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-text-main truncate">{patient.name}</div>
                {patient.email && <div className="text-[10px] text-text-muted truncate">{patient.email}</div>}
              </div>
            </div>
            <div className="text-[12.5px] text-text-main">{patient.phone ?? "---"}</div>
            <div>
              <span className="text-[11px] text-text-muted">
                {patient.source_channel ? (channelLabel[patient.source_channel] ?? patient.source_channel) : "---"}
              </span>
            </div>
            <div className="text-[12px] text-text-muted">
              {patient.last_visit_at ? format(new Date(patient.last_visit_at), "dd MMM yyyy", { locale: ru }) : "Нет визитов"}
            </div>
            <div className="text-center">
              {patient.ltv_score !== null ? (
                <Pill variant={ltvColor(patient.ltv_score)}>{patient.ltv_score}</Pill>
              ) : (
                <span className="text-[11px] text-text-muted">---</span>
              )}
            </div>
            <div className="text-[13px] font-bold text-text-main text-right">{formatRevenue(patient.total_revenue)}</div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[12px] text-text-muted">Стр. {page} из {totalPages} · {total} пациентов</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="w-8 h-8 rounded-[9px] flex items-center justify-center border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
              <ChevronLeft size={15} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= totalPages - 2) p = totalPages - 4 + i;
              else p = page - 2 + i;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className="w-8 h-8 rounded-[9px] text-[12.5px] font-semibold border-none cursor-pointer transition-colors"
                  style={p === page ? { background: "linear-gradient(135deg,#5B4CF5,#3B7FED)", color: "#fff" } : { background: "rgba(91,76,245,0.06)", color: "#5B4CF5" }}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="w-8 h-8 rounded-[9px] flex items-center justify-center border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
