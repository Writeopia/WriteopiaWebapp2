import { type ReactNode, useEffect, useId, useRef } from "react";

import { cn } from "./cn";

type DialogProps = {
  open: boolean;
  /** Called when the user dismisses the dialog: Escape or a click on the backdrop. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons, drawn at the bottom right. */
  actions?: ReactNode;
  /** "lg" for a dialog with its own navigation, like the settings. */
  size?: "md" | "lg";
  className?: string;
};

/**
 * A modal dialog over the native <dialog>, which gives the focus trap, the Escape key and the
 * inert page behind for free.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  size = "md",
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // The dialog itself handles the keyboard (Escape); the click is only for the backdrop.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Closing is the parent's decision, through `open`.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto border-card-border bg-card-bg text-on-bg",
        size === "md" ? "w-[min(32rem,calc(100vw-2rem))]" : "w-[min(56rem,calc(100vw-2rem))]",
        "rounded-lg border p-0 shadow-xl backdrop:bg-black/40",
        className,
      )}
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <div className="text-text-light">{children}</div>
          {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
        </div>
      )}
    </dialog>
  );
}
