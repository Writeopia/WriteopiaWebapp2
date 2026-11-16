import { create } from "zustand";

import type { Document, Folder } from "~/core/models";

import type { MenuEntry } from "./model";

/**
 * The dialog of the menu that is open, if any. Kept outside the screens because the cards,
 * the selection bar and the side tree all open the same dialogs.
 */
export type MenuDialog =
  | { type: "newFolder"; parentId: string }
  | { type: "editFolder"; folder: Folder }
  | { type: "icon"; document: Document }
  | { type: "delete"; entries: MenuEntry[] }
  | { type: "move"; entries: MenuEntry[] };

type MenuDialogState = {
  dialog: MenuDialog | null;
  open: (dialog: MenuDialog) => void;
  close: () => void;
};

export const useMenuDialogs = create<MenuDialogState>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));
