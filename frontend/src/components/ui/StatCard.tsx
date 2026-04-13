import { type ReactNode } from "react";
import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "up" | "down";
  icon?: ReactNode;
  className?: string;
}

export default function StatCard({
  label,
  value,
  delta,
  deltaType,
  icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={clsx(
        "rounded-card p-[16px_18px] transition-transform duration-150 hover:-translate-y-0.5",
        className,
      )}
      style={{
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 18px rgba(120,140,180,0.18)",
      }}
    >
      {icon && <div className="text-xl mb-[7px]">{icon}</div>}
      <div className="text-[11px] text-text-muted font-medium mb-[5px]">
        {label}
      </div>
      <div className="text-2xl font-extrabold tracking-tight">{value}</div>
      {delta && (
        <div
          className={clsx(
            "text-[11px] mt-[3px] font-semibold",
            deltaType === "up" && "text-accent3",
            deltaType === "down" && "text-danger",
          )}
        >
          {deltaType === "up" ? "\u2191 " : "\u2193 "}
          {delta}
        </div>
      )}
    </div>
  );
}
