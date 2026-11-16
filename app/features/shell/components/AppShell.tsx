import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect } from "react";
import { useLocation, useSearchParams } from "react-router";

import { t } from "~/core/i18n";
import { Button, Dialog } from "~/core/ui";

import { SIDE_MENU_MAX_WIDTH, SIDE_MENU_MIN_WIDTH, useShellStore } from "../store";
import { SettingsDialog } from "./SettingsDialog";
import { SideMenu } from "./SideMenu";

const KEYBOARD_STEP = 16;

/**
 * The frame of the app: the side menu and, next to it, the screen of the route. On a wide
 * screen the menu can be resized by its edge and hidden; on a narrow one it is a drawer.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const width = useShellStore((state) => state.width);
  const collapsed = useShellStore((state) => state.collapsed);
  const drawerOpen = useShellStore((state) => state.drawerOpen);
  const setDrawerOpen = useShellStore((state) => state.setDrawerOpen);

  // Going somewhere from the drawer closes it.
  useEffect(() => setDrawerOpen(false), [location.pathname, setDrawerOpen]);

  const closeOverPage = (name: string) =>
    setSearchParams(
      (params) => {
        params.delete(name);
        return params;
      },
      { replace: true },
    );

  return (
    <div className="flex h-full">
      {!collapsed && (
        <aside className="relative hidden shrink-0 md:block" style={{ width }}>
          <SideMenu />
          <ResizeHandle />
        </aside>
      )}

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label={t("closeSideMenu")}
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(20rem,85vw)] shadow-xl">
            <SideMenu />
          </aside>
        </div>
      )}

      <main className="h-full min-w-0 flex-1">{children}</main>

      {searchParams.has("settings") && <SettingsDialog onClose={() => closeOverPage("settings")} />}
      {searchParams.has("search") && (
        <Dialog
          open
          onClose={() => closeOverPage("search")}
          title={t("search")}
          actions={
            <Button variant="secondary" onClick={() => closeOverPage("search")}>
              {t("close")}
            </Button>
          }
        >
          {t("searchComingSoon")}
        </Dialog>
      )}
    </div>
  );
}

/** The right edge of the side menu: dragging it, or the arrow keys on it, change the width. */
function ResizeHandle() {
  const width = useShellStore((state) => state.width);
  const setWidth = useShellStore((state) => state.setWidth);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const left = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    const onMove = (move: globalThis.PointerEvent) => setWidth(move.clientX - left);
    const onUp = (up: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setWidth(up.clientX - left, true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setWidth(width + (event.key === "ArrowRight" ? KEYBOARD_STEP : -KEYBOARD_STEP), true);
  };

  return (
    // A separator that can be focused and moved is a widget (a window splitter) in ARIA.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("resizeSideMenu")}
      aria-valuenow={width}
      aria-valuemin={SIDE_MENU_MIN_WIDTH}
      aria-valuemax={SIDE_MENU_MAX_WIDTH}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize hover:bg-accent/40 focus-visible:bg-accent/40"
    />
  );
}
