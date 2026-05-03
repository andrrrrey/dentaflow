import { useState, useRef, useEffect } from "react";
import { usePatientSearch } from "../../api/patients";

interface PatientSearchInputProps {
  value: string;
  onChangeName: (name: string) => void;
  onSelectPatient: (id: string, name: string, phone: string) => void;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  className?: string;
}

export default function PatientSearchInput({
  value,
  onChangeName,
  onSelectPatient,
  placeholder = "Иванов Иван",
  inputStyle,
  className = "",
}: PatientSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    timerRef.current && clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), 300);
    return () => { timerRef.current && clearTimeout(timerRef.current); };
  }, [value]);

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  const { data } = usePatientSearch(debounced);
  const results = data?.items ?? [];

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChangeName(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className={`px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none w-full ${className}`}
        style={inputStyle}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-y-auto z-[300]"
          style={{
            background: "rgba(255,255,255,0.98)",
            boxShadow: "0 8px 24px rgba(91,76,245,0.15)",
            border: "1px solid rgba(91,76,245,0.12)",
            maxHeight: 240,
          }}
        >
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelectPatient(p.id, p.name, p.phone ?? "");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-[8px] hover:bg-[rgba(91,76,245,0.06)] flex items-center justify-between gap-2 border-none cursor-pointer bg-transparent"
            >
              <span className="text-[13px] font-semibold text-text-main truncate">{p.name}</span>
              {p.phone && <span className="text-[12px] text-text-muted flex-shrink-0">{p.phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
