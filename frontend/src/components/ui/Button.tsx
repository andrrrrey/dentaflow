import { type ReactNode, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
}

export default function Button({
  variant = "primary",
  size = "md",
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-semibold font-raleway cursor-pointer transition-all duration-150 border-none";

  const sizeStyles = {
    sm: "px-[14px] py-[6px] text-xs rounded-[10px]",
    md: "px-[18px] py-[9px] text-[13px] rounded-xl",
  };

  const variantStyles = {
    primary: "text-white hover:opacity-90 hover:-translate-y-px",
    secondary:
      "text-accent2 border border-solid hover:-translate-y-px",
    ghost: "bg-transparent text-accent2 hover:bg-[rgba(91,76,245,0.08)]",
  };

  const variantInline: Record<string, React.CSSProperties> = {
    primary: {
      background: "linear-gradient(135deg, #5B4CF5, #3B7FED)",
      boxShadow: "0 4px 14px rgba(91,76,245,0.3)",
    },
    secondary: {
      background: "rgba(91,76,245,0.08)",
      borderColor: "rgba(91,76,245,0.18)",
    },
    ghost: {},
  };

  return (
    <button
      className={clsx(
        base,
        sizeStyles[size],
        variantStyles[variant],
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      style={variantInline[variant]}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
