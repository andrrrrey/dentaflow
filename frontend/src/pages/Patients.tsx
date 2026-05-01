import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import Pill from "../components/ui/Pill";
import { usePatients } from "../api/patients";
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

type VisitedFilter = "" | "visited" | "not_visited";

const visitedLabels: Record<VisitedFilter, string> = {
  "": "Все",
  visited: "Посетили",
  not_visited: "Не посетили",
};

export default function Patients() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [visited, setVisited] = useState<VisitedFilter>("");
  const navigate = useNavigate();
  const { data, isLoading } = usePatients(search, page, PAGE_SIZE, visited || undefined);
  const syncMutation = useSyncSchedule();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  function handleVisited(v: VisitedFilter) {
    setVisited(v);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div
          className="flex items-center gap-2 px-4 py-[10px] rounded-[14px] flex-1"
          style={{
            background: "rgba(255,255,255,0.65)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
          }}
        >
          <Search size={16} className="text-text-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Поиск по имени, телефону, email..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-text-main placeholder:text-text-muted"
          />
          <span className="text-[11px] text-text-muted flex-shrink-0">
            {data ? `${total} пациентов` : ""}
          </span>
        </div>

        {/* Visited filter */}
        <div
          className="flex gap-[2px] p-[3px] rounded-[14px] flex-shrink-0"
          style={{ background: "rgba(91,76,245,0.07)" }}
        >
          {(["", "visited", "not_visited"] as VisitedFilter[]).map((v) => (
            <button
              key={v}
              onClick={() => handleVisited(v)}
              className="px-3 py-[6px] rounded-[11px] text-[11px] font-semibold border-none cursor-pointer transition-all"
              style={
                visited === v
                  ? { background: "#fff", color: "#5B4CF5", boxShadow: "0 1px 6px rgba(91,76,245,0.15)" }
                  : { background: "transparent", color: "#8a8fa5" }
              }
            >
              {visitedLabels[v]}
            </button>
          ))}
        </div>

        {/* Sync button */}
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="flex items-center gap-[6px] px-3 py-[10px] rounded-[14px] border-none cursor-pointer transition-colors flex-shrink-0 text-[11px] font-semibold disabled:opacity-50"
          style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
        >
          <RefreshCw size={13} className={syncMutation.isPending ? "animate-spin" : ""} />
          {syncMutation.isPending ? "Запрос..." : syncMutation.isSuccess ? "Запущено ✓" : "Синхронизировать"}
        </button>
      </div>

      {/* Table */}
      <div
        className="rounded-glass overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.65)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 4px 20px rgba(120,140,180,0.18)",
        }}
      >
        {/* Header */}
        <div className="hidden md:grid grid-cols-[1fr_160px_100px_120px_80px_100px] gap-3 px-[18px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
          {["Пациент", "Телефон", "Источник", "Последний визит", "LTV", "Выручка"].map((h) => (
            <span key={h} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              {h}
            </span>
          ))}
        </div>

        {isLoading && (
          <div className="text-center py-8 text-text-muted text-[13px]">Загрузка...</div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="text-center py-8 text-text-muted text-[13px]">Пациенты не найдены</div>
        )}

        {items.map((patient) => (
          <button
            key={patient.id}
            onClick={() => navigate(`/patients/${patient.id}`)}
            className="w-full text-left md:grid md:grid-cols-[1fr_160px_100px_120px_80px_100px] gap-3 px-[18px] py-[12px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors cursor-pointer bg-transparent border-x-0 border-t-0 flex flex-col md:flex-row md:items-center"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
              >
                <User size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-text-main truncate">{patient.name}</div>
                {patient.email && (
                  <div className="text-[10px] text-text-muted truncate">{patient.email}</div>
                )}
              </div>
            </div>

            <div className="text-[12.5px] text-text-main">{patient.phone ?? "---"}</div>

            <div>
              <span className="text-[11px] text-text-muted">
                {patient.source_channel ? (channelLabel[patient.source_channel] ?? patient.source_channel) : "---"}
              </span>
            </div>

            <div className="text-[12px] text-text-muted">
              {patient.last_visit_at
                ? format(new Date(patient.last_visit_at), "dd MMM yyyy", { locale: ru })
                : "Нет визитов"}
            </div>

            <div className="text-center">
              {patient.ltv_score !== null ? (
                <Pill variant={ltvColor(patient.ltv_score)}>{patient.ltv_score}</Pill>
              ) : (
                <span className="text-[11px] text-text-muted">---</span>
              )}
            </div>

            <div className="text-[13px] font-bold text-text-main text-right">
              {formatRevenue(patient.total_revenue)}
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[12px] text-text-muted">
            Стр. {page} из {totalPages} · {total} пациентов
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded-[9px] flex items-center justify-center border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
            >
              <ChevronLeft size={15} />
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= totalPages - 2) p = totalPages - 4 + i;
              else p = page - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="w-8 h-8 rounded-[9px] text-[12.5px] font-semibold border-none cursor-pointer transition-colors"
                  style={
                    p === page
                      ? { background: "linear-gradient(135deg,#5B4CF5,#3B7FED)", color: "#fff" }
                      : { background: "rgba(91,76,245,0.06)", color: "#5B4CF5" }
                  }
                >
                  {p}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 rounded-[9px] flex items-center justify-center border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
