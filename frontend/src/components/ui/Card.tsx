import { type ReactNode } from "react";
import clsx from "clsx";

interface CardProps {
  className?: string;
  children: ReactNode;
}

export default function Card({ className, children }: CardProps) {
  return (
    <div
      className={clsx("rounded-glass p-[20px_22px]", className)}
      style={{
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 20px rgba(120,140,180,0.18)",
      }}
    >
      {children}
    </div>
  );
}
