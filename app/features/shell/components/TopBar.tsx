import { PanelLeft } from "lucide-react";
import type { ReactNode } from "react";

import { t } from "~/core/i18n";
import { cn } from "~/core/ui";

import { useShellStore } from "../store";

/**
 * The bar over the content of a screen. It carries the button that brings the side menu back:
 * always on a narrow screen, where the menu is a drawer, and on a wide one while it is hidden.
 */
export function TopBar({ children }: { children?: ReactNode }) {
  const collapsed = useShellStore((state) => state.collapsed);
  const setCollapsed = useShellStore((state) => state.setCollapsed);
  const setDrawerOpen = useShellStore((state) => state.setDrawerOpen);

  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-divider px-3">
      <button
        type="button"
        aria-label={t("openSideMenu")}
        title={t("openSideMenu")}
        onClick={() => {
          setCollapsed(false);
          setDrawerOpen(true);
        }}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-options-selector",
          !collapsed && "md:hidden",
        )}
      >
        <PanelLeft size={18} aria-hidden />
      </button>
      {children}
    </header>
  );
}
