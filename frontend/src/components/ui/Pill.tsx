import { type ReactNode } from "react";
import clsx from "clsx";

type PillVariant = "green" | "red" | "yellow" | "blue" | "purple" | "gray";

interface PillProps {
  variant: PillVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<PillVariant, string> = {
  green: "bg-[rgba(0,201,167,0.12)] text-[#007d6e]",
  red: "bg-[rgba(244,75,110,0.12)] text-[#c52048]",
  yellow: "bg-[rgba(245,166,35,0.12)] text-[#b87200]",
  blue: "bg-[rgba(59,127,237,0.12)] text-[#1a55b0]",
  purple: "bg-[rgba(91,76,245,0.12)] text-[#4834d4]",
  gray: "bg-[rgba(120,140,180,0.12)] text-[#5a6a8a]",
};

export default function Pill({ variant, children, className }: PillProps) {
  return (
    <span
      className={clsx(
        "inline-block px-[9px] py-[3px] rounded-full text-[11px] font-semibold",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
