import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, User, Briefcase, MessageCircle, Loader2 } from "lucide-react";
import { globalSearch } from "../../api/search";
import type { SearchResult } from "../../api/search";

const TYPE_ICON: Record<string, React.ReactNode> = {
  patient:       <User size={14} className="text-accent2" />,
  deal:          <Briefcase size={14} className="text-[#F5A623]" />,
  communication: <MessageCircle size={14} className="text-[#00C9A7]" />,
};

const TYPE_LABEL: Record<string, string> = {
  patient:       "Пациент",
  deal:          "Сделка",
  communication: "Коммуникация",
};

interface Props {
  onClose: () => void;
}

export default function GlobalSearch({ onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const data = await globalSearch(q);
      const flat = [
        ...data.results.patients,
        ...data.results.deals,
        ...data.results.communications,
      ];
      setResults(flat);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(query), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, runSearch]);

  function handleSelect(result: SearchResult) {
    navigate(result.url);
    onClose();
  }

  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    (grouped[r.type] ??= []).push(r);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[560px] mx-4 rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "rgba(255,255,255,0.97)",
          boxShadow: "0 24px 72px rgba(91,76,245,0.22)",
          border: "1px solid rgba(255,255,255,0.9)",
          maxHeight: "70vh",
        }}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(91,76,245,0.08)]">
          <Search size={16} className="text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск пациентов, сделок, коммуникаций..."
            className="flex-1 text-[14px] bg-transparent border-none outline-none text-text-main placeholder:text-text-muted"
            onKeyDown={(e) => e.key === "Escape" && onClose()}
          />
          {loading && <Loader2 size={15} className="animate-spin text-text-muted flex-shrink-0" />}
          {!loading && query && (
            <button onClick={() => setQuery("")} className="text-text-muted hover:text-text-main border-none bg-transparent cursor-pointer">
              <X size={15} />
            </button>
          )}
          <kbd className="text-[10px] font-mono text-text-muted bg-[rgba(91,76,245,0.07)] px-1.5 py-0.5 rounded-md flex-shrink-0">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {error && (
            <div className="text-center text-[12px] text-[#F44B6E] py-6">
              Ошибка поиска. Попробуйте ещё раз.
            </div>
          )}

          {!loading && !error && query.length >= 2 && results.length === 0 && (
            <div className="text-center text-[13px] text-text-muted py-8">
              Ничего не найдено по запросу «{query}»
            </div>
          )}

          {!loading && !error && query.length < 2 && (
            <div className="text-center text-[12px] text-text-muted py-8">
              Введите минимум 2 символа для поиска
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <div className="px-4 py-2 text-[10.5px] font-bold text-text-muted uppercase tracking-wider bg-[rgba(91,76,245,0.03)]">
                {TYPE_LABEL[type] ?? type}
              </div>
              {items.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-3 px-4 py-[10px] hover:bg-[rgba(91,76,245,0.05)] transition-colors text-left border-none bg-transparent cursor-pointer border-b border-[rgba(91,76,245,0.04)]"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[rgba(91,76,245,0.07)] flex-shrink-0">
                    {TYPE_ICON[r.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-text-main truncate">{r.name}</div>
                    {(r.phone || r.preview) && (
                      <div className="text-[11px] text-text-muted truncate">{r.phone ?? r.preview}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-[rgba(91,76,245,0.06)] text-[11px] text-text-muted text-right">
            Найдено: {results.length}
          </div>
        )}
      </div>
    </div>
  );
}
