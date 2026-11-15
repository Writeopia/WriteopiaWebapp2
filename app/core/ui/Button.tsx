import type { ButtonHTMLAttributes } from "react";

import { cn } from "./cn";
import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Shows a spinner and blocks clicks while something is in flight. */
  loading?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:brightness-110",
  secondary: "bg-options-selector text-on-bg hover:bg-highlight",
  ghost: "text-on-bg hover:bg-options-selector",
  danger: "bg-error text-global-bg hover:brightness-110",
};

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium",
        "transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}
