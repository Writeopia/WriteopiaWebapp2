import { t } from "~/core/i18n";

import { cn } from "./cn";
import { useToastStore } from "./toast";

/** Draws the toasts. Rendered once, in the root of the app. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex max-w-md items-center gap-3 bg-on-bg text-global-bg",
            "rounded-lg px-4 py-3 text-sm shadow-lg",
            toast.kind === "error" && "bg-error",
          )}
        >
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="font-bold underline"
              onClick={() => {
                toast.action?.onClick();
                dismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label={t("dismiss")}
            className="opacity-70 hover:opacity-100"
            onClick={() => dismiss(toast.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
