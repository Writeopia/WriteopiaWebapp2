import { create } from "zustand";

import { readPreference, writePreference } from "~/core/storage";

import { type Arrangement, ARRANGEMENTS, type OrderBy } from "./model";
import { parseOrderBy } from "./sorting";

/** How the menu is shown. Remembered by this browser, like the theme. */

export const ARRANGEMENT_KEY = "writeopia.notesArrangement";
export const ORDER_BY_KEY = "writeopia.orderBy";

export function parseArrangement(value: string | null | undefined): Arrangement {
  return ARRANGEMENTS.find((arrangement) => arrangement === value) ?? "grid";
}

type MenuPreferences = {
  arrangement: Arrangement;
  orderBy: OrderBy;
  setArrangement: (arrangement: Arrangement) => void;
  setOrderBy: (orderBy: OrderBy) => void;
  /** Reads the stored values again. For tests, which clear the storage between them. */
  reload: () => void;
};

const inBrowser = typeof window !== "undefined";

function stored() {
  return {
    // The page is prerendered at build time, where there is no storage to read.
    arrangement: parseArrangement(inBrowser ? readPreference(ARRANGEMENT_KEY) : null),
    orderBy: parseOrderBy(inBrowser ? readPreference(ORDER_BY_KEY) : null),
  };
}

export const useMenuPreferences = create<MenuPreferences>((set) => ({
  ...stored(),
  setArrangement: (arrangement) => {
    set({ arrangement });
    writePreference(ARRANGEMENT_KEY, arrangement);
  },
  setOrderBy: (orderBy) => {
    set({ orderBy });
    writePreference(ORDER_BY_KEY, orderBy);
  },
  reload: () => set(stored()),
}));
