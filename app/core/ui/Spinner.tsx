import { t } from "~/core/i18n";

import { cn } from "./cn";

type SpinnerProps = {
  /** Diameter in pixels. */
  size?: number;
  className?: string;
  /** What is loading, for screen readers. */
  label?: string;
};

export function Spinner({ size = 20, className, label = t("loading") }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-block rounded-full border-2 border-current", className)}
      style={{
        width: size,
        height: size,
        borderRightColor: "transparent",
        animation: "wr-spin 0.7s linear infinite",
      }}
    />
  );
}
