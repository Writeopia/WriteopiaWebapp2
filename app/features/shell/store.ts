import { create } from "zustand";

import { readPreference, writePreference } from "~/core/storage";

/** The side menu: how wide it is and whether it shows. Remembered by this browser. */

export const SIDE_MENU_WIDTH_KEY = "writeopia.sideMenuWidth";
export const SIDE_MENU_COLLAPSED_KEY = "writeopia.sideMenuCollapsed";

export const SIDE_MENU_MIN_WIDTH = 200;
export const SIDE_MENU_MAX_WIDTH = 480;
export const SIDE_MENU_DEFAULT_WIDTH = 280;

export function clampSideMenuWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDE_MENU_DEFAULT_WIDTH;
  return Math.round(Math.min(SIDE_MENU_MAX_WIDTH, Math.max(SIDE_MENU_MIN_WIDTH, width)));
}

type ShellState = {
  width: number;
  /** Hidden on a wide screen, by the user's choice. */
  collapsed: boolean;
  /** Open as a drawer over the page, on a narrow screen. */
  drawerOpen: boolean;
  /** Changes the width while the edge is dragged; [persist] when the drag ends. */
  setWidth: (width: number, persist?: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
  /** Reads the stored values again. For tests, which clear the storage between them. */
  reload: () => void;
};

const inBrowser = typeof window !== "undefined";

function stored() {
  const width = inBrowser ? readPreference(SIDE_MENU_WIDTH_KEY) : null;

  return {
    width: width === null ? SIDE_MENU_DEFAULT_WIDTH : clampSideMenuWidth(Number(width)),
    collapsed: inBrowser && readPreference(SIDE_MENU_COLLAPSED_KEY) === "true",
    drawerOpen: false,
  };
}

export const useShellStore = create<ShellState>((set) => ({
  ...stored(),
  setWidth: (width, persist = false) => {
    const clamped = clampSideMenuWidth(width);
    set({ width: clamped });
    if (persist) writePreference(SIDE_MENU_WIDTH_KEY, String(clamped));
  },
  setCollapsed: (collapsed) => {
    set({ collapsed });
    writePreference(SIDE_MENU_COLLAPSED_KEY, String(collapsed));
  },
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  reload: () => set(stored()),
}));
