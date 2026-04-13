import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import Pill from "../components/ui/Pill";
import { usePatients } from "../api/patients";

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
  if (v === 0) return "0 \u20BD";
  if (v >= 1_000_000) {
    return (v / 1_000_000).toFixed(1).replace(".", ",") + " млн \u20BD";
  }
  return v.toLocaleString("ru-RU") + " \u20BD";
}

export default function Patients() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { data, isLoading } = usePatients(search);

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Search */}
      <div
        className="flex items-center gap-2 px-4 py-[10px] rounded-[14px]"
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
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-[13px] text-text-main placeholder:text-text-muted"
        />
        <span className="text-[11px] text-text-muted flex-shrink-0">
          {data ? `${data.total} пациентов` : ""}
        </span>
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
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
            Пациент
          </span>
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
            Телефон
          </span>
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
            Источник
          </span>
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
            Последний визит
          </span>
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider text-center">
            LTV
          </span>
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider text-right">
            Выручка
          </span>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-8 text-text-muted text-[13px]">
            Загрузка...
          </div>
        )}

        {/* Empty */}
        {!isLoading && items.length === 0 && (
          <div className="text-center py-8 text-text-muted text-[13px]">
            Пациенты не найдены
          </div>
        )}

        {/* Rows */}
        {items.map((patient) => (
          <button
            key={patient.id}
            onClick={() => navigate(`/patients/${patient.id}`)}
            className="w-full text-left md:grid md:grid-cols-[1fr_160px_100px_120px_80px_100px] gap-3 px-[18px] py-[12px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors cursor-pointer bg-transparent border-x-0 border-t-0 flex flex-col md:flex-row md:items-center"
          >
            {/* Name */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
              >
                <User size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-text-main truncate">
                  {patient.name}
                </div>
                {patient.email && (
                  <div className="text-[10px] text-text-muted truncate">
                    {patient.email}
                  </div>
                )}
              </div>
            </div>

            {/* Phone */}
            <div className="text-[12.5px] text-text-main">
              {patient.phone ?? "---"}
            </div>

            {/* Source */}
            <div>
              {patient.source_channel ? (
                <span className="text-[11px] text-text-muted">
                  {channelLabel[patient.source_channel] ?? patient.source_channel}
                </span>
              ) : (
                <span className="text-[11px] text-text-muted">---</span>
              )}
            </div>

            {/* Last visit */}
            <div className="text-[12px] text-text-muted">
              {patient.last_visit_at
                ? format(new Date(patient.last_visit_at), "dd MMM yyyy", { locale: ru })
                : "Нет визитов"}
            </div>

            {/* LTV */}
            <div className="text-center">
              {patient.ltv_score !== null ? (
                <Pill variant={ltvColor(patient.ltv_score)}>
                  {patient.ltv_score}
                </Pill>
              ) : (
                <span className="text-[11px] text-text-muted">---</span>
              )}
            </div>

            {/* Revenue */}
            <div className="text-[13px] font-bold text-text-main text-right">
              {formatRevenue(patient.total_revenue)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
