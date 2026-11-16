import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "./cn";

export type MenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  /** Drawn in the error color, for actions like delete. */
  danger?: boolean;
  /** Marks the current choice of a list of options, like the sort order. */
  checked?: boolean;
};

type MenuProps = {
  /** What the button shows. */
  trigger: ReactNode;
  /** The button's name for screen readers, when the trigger is only an icon. */
  label?: string;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
  /** Replaces the look of the button, for the small ones on cards and rows. */
  triggerClassName?: string;
};

function enabledItems(list: HTMLElement | null): HTMLButtonElement[] {
  return Array.from(
    list?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)',
    ) ?? [],
  );
}

/** Closes the list on a press outside [containerRef], and focuses its first item. */
function useOpenList(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    enabledItems(listRef.current)[0]?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, containerRef, listRef]);
}

type MenuListProps = {
  ref: RefObject<HTMLDivElement | null>;
  id?: string;
  label?: string;
  items: MenuItem[];
  /** Escape or a chosen item: the focus goes back to what opened the list. */
  onClose: () => void;
  /** Tab: the focus moves on by itself. */
  onLeave: () => void;
  className?: string;
  style?: React.CSSProperties;
};

function MenuList({ ref, id, label, items, onClose, onLeave, className, style }: MenuListProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = enabledItems(ref.current);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose();
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
        onLeave();
        break;
    }
  };

  return (
    <div
      ref={ref}
      id={id}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={style}
      className={cn(
        "z-50 min-w-44 rounded-lg border border-card-border bg-card-bg p-1 text-on-bg shadow-lg",
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role={item.checked === undefined ? "menuitem" : "menuitemradio"}
          aria-checked={item.checked}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-normal",
            "whitespace-nowrap hover:bg-options-selector focus:bg-options-selector",
            "disabled:cursor-not-allowed disabled:opacity-50",
            item.danger && "text-error",
            item.checked && "font-medium text-accent",
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** A button that opens a list of actions, driven by mouse or keyboard. */
export function Menu({
  trigger,
  label,
  items,
  align = "start",
  className,
  triggerClassName,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useOpenList(open, containerRef, listRef, () => setOpen(false));

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
        className={
          triggerClassName ??
          "inline-flex h-10 items-center gap-2 rounded-lg px-3 hover:bg-options-selector"
        }
      >
        {trigger}
      </button>
      {open && (
        <MenuList
          ref={listRef}
          id={menuId}
          items={items}
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
          onLeave={() => setOpen(false)}
          className={cn("absolute mt-1", align === "end" ? "right-0" : "left-0")}
        />
      )}
    </div>
  );
}

type ContextMenuProps = {
  /** Where the pointer asked for the menu, in the page; null while it is closed. */
  position: { x: number; y: number } | null;
  items: MenuItem[];
  label?: string;
  onClose: () => void;
};

const EDGE = 8;

/** The list of actions of a right click, opened where the pointer is. */
export function ContextMenu({ position, items, label, onClose }: ContextMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null);

  useOpenList(position !== null, listRef, listRef, onClose);

  // Kept inside the window: a menu asked for near an edge opens toward the middle.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!position || !list) return;

    setPlaced({
      left: Math.max(EDGE, Math.min(position.x, window.innerWidth - list.offsetWidth - EDGE)),
      top: Math.max(EDGE, Math.min(position.y, window.innerHeight - list.offsetHeight - EDGE)),
    });
  }, [position]);

  if (!position) return null;

  return (
    <MenuList
      ref={listRef}
      label={label}
      items={items}
      onClose={onClose}
      onLeave={onClose}
      className="fixed"
      style={placed ?? { left: position.x, top: position.y }}
    />
  );
}
