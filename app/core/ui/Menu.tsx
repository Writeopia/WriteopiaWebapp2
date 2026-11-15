import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";

import { cn } from "./cn";

export type MenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  /** Drawn in the error color, for actions like delete. */
  danger?: boolean;
};

type MenuProps = {
  /** What the button shows. */
  trigger: ReactNode;
  /** The button's name for screen readers, when the trigger is only an icon. */
  label?: string;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
};

/** A button that opens a list of actions, driven by mouse or keyboard. */
export function Menu({ trigger, label, items, align = "start", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const enabledItems = () =>
    Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
        [],
    );

  useEffect(() => {
    if (!open) return;

    enabledItems()[0]?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = enabledItems();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "ArrowDown":
        event.preventDefault();
        buttons[(current + 1) % buttons.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        buttons[(current - 1 + buttons.length) % buttons.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        buttons[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        buttons[buttons.length - 1]?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-lg px-3 hover:bg-options-selector"
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute z-50 mt-1 min-w-44 rounded-lg border border-card-border bg-card-bg p-1",
            "shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                "hover:bg-options-selector focus:bg-options-selector",
                "disabled:cursor-not-allowed disabled:opacity-50",
                item.danger && "text-error",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
