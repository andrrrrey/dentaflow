import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, User, Trash2, Plus } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  useSegments,
  useSegmentMembers,
  useAddSegmentMembers,
  useRemoveSegmentMember,
  downloadSegmentExcel,
} from "../../api/segments";
import PatientSearchInput from "../ui/PatientSearchInput";

const PAGE_SIZE = 50;

function formatRevenue(v: number): string {
  if (v === 0) return "0 ₽";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".", ",") + " млн ₽";
  return v.toLocaleString("ru-RU") + " ₽";
}

interface Props {
  segmentKey: string;
  onBack: () => void;
}

export default function SegmentMembersView({ segmentKey, onBack }: Props) {
  const [page, setPage] = useState(1);
  const [addName, setAddName] = useState("");
  const navigate = useNavigate();

  const { data: segData } = useSegments();
  const segment = (segData?.items ?? []).find((s) => s.key === segmentKey);
  const isManual = segment?.kind === "manual";

  const { data, isLoading } = useSegmentMembers(segmentKey, page, PAGE_SIZE);
  const addMembers = useAddSegmentMembers();
  const removeMember = useRemoveSegmentMember();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-3 py-[8px] rounded-[12px] border-none cursor-pointer text-[12px] font-semibold"
            style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
          >
            <ChevronLeft size={14} /> Списки
          </button>
          <span className="text-[15px] font-bold text-text-main">
            {segment?.name ?? segmentKey}
          </span>
          <span className="text-[12px] text-text-muted">· {total}</span>
        </div>
        <button
          onClick={() => downloadSegmentExcel(segmentKey, `${segmentKey}.xlsx`)}
          disabled={total === 0}
          className="flex items-center gap-1.5 px-4 py-[9px] rounded-[12px] border-none cursor-pointer text-[12px] font-semibold disabled:opacity-40"
          style={{ background: "rgba(0,201,167,0.12)", color: "#00a98e" }}
        >
          <Download size={14} /> Скачать Excel
        </button>
      </div>

      {/* Manual add */}
      {isManual && (
        <div
          className="rounded-[14px] p-3 flex items-end gap-2"
          style={{ background: "rgba(255,255,255,0.85)", border: "1px solid rgba(91,76,245,0.12)" }}
        >
          <div className="flex-1">
            <label className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">
              Добавить пациента в список
            </label>
            <PatientSearchInput
              value={addName}
              onChangeName={setAddName}
              onSelectPatient={(id) => {
                addMembers.mutate({ key: segmentKey, patientIds: [id] });
                setAddName("");
              }}
              placeholder="Имя или телефон…"
              inputStyle={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(91,76,245,0.15)" }}
            />
          </div>
          <Plus size={18} className="text-text-muted mb-2" />
        </div>
      )}

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
        <div className="hidden md:grid grid-cols-[1fr_150px_120px_1fr_40px] gap-3 px-[18px] py-[10px] border-b border-[rgba(91,76,245,0.08)]">
          {["Пациент", "Телефон", "Посл. визит", "Причина", ""].map((h, i) => (
            <span key={i} className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              {h}
            </span>
          ))}
        </div>

        {isLoading && <div className="text-center py-8 text-text-muted text-[13px]">Загрузка…</div>}
        {!isLoading && items.length === 0 && (
          <div className="text-center py-8 text-text-muted text-[13px]">Список пуст</div>
        )}

        {items.map((m) => (
          <div
            key={m.patient_id}
            className="md:grid md:grid-cols-[1fr_150px_120px_1fr_40px] gap-3 px-[18px] py-[12px] border-b border-[rgba(91,76,245,0.04)] hover:bg-[rgba(91,76,245,0.04)] transition-colors flex flex-col md:flex-row md:items-center"
          >
            <button
              onClick={() => navigate(`/patients/${m.patient_id}`)}
              className="flex items-center gap-2.5 min-w-0 bg-transparent border-none cursor-pointer text-left p-0"
            >
              <div
                className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)" }}
              >
                <User size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-text-main truncate">{m.name}</div>
                <div className="text-[10px] text-text-muted truncate">{formatRevenue(m.total_revenue)}</div>
              </div>
            </button>
            <div className="text-[12.5px] text-text-main">{m.phone ?? "---"}</div>
            <div className="text-[12px] text-text-muted">
              {m.last_visit_at ? format(new Date(m.last_visit_at), "dd MMM yyyy", { locale: ru }) : "—"}
            </div>
            <div className="text-[11.5px] text-text-muted truncate">{m.reason ?? "—"}</div>
            <div className="flex items-center justify-end">
              {isManual && (
                <button
                  onClick={() => removeMember.mutate({ key: segmentKey, patientId: m.patient_id })}
                  title="Убрать из списка"
                  className="w-7 h-7 rounded-[8px] flex items-center justify-center border-none cursor-pointer"
                  style={{ background: "rgba(255,90,90,0.10)", color: "#e04848" }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[12px] text-text-muted">
            Стр. {page} из {totalPages} · {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded-[9px] flex items-center justify-center border-none cursor-pointer disabled:opacity-40"
              style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 rounded-[9px] flex items-center justify-center border-none cursor-pointer disabled:opacity-40"
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
