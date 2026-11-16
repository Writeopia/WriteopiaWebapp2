import { type DragEvent, useState } from "react";
import { create } from "zustand";

import { entryParentId, type MenuEntry } from "./model";
import type { MoveTarget } from "./queries";

/**
 * Dragging entries onto a folder: a card, a segment of the breadcrumb or a row of the side
 * tree. The browser does not show what is dragged until the drop, so it is kept here.
 */
type DragState = {
  dragged: MenuEntry[] | null;
  start: (entries: MenuEntry[]) => void;
  end: () => void;
};

export const useDragStore = create<DragState>((set) => ({
  dragged: null,
  start: (entries) => set({ dragged: entries }),
  end: () => set({ dragged: null }),
}));

/** Whether dropping [entries] on [folderId] would move anything. */
export function canDropOn(entries: readonly MenuEntry[] | null, folderId: string): boolean {
  if (!entries || entries.some((entry) => entry.id === folderId)) return false;
  return entries.some((entry) => entryParentId(entry) !== folderId);
}

/** What makes an element a place to drop entries into [target]. */
export function useFolderDrop(
  target: MoveTarget,
  onDrop: (entries: MenuEntry[], target: MoveTarget) => void,
) {
  const [isOver, setIsOver] = useState(false);

  const accepts = () => canDropOn(useDragStore.getState().dragged, target.id);

  return {
    isOver,
    dropProps: {
      onDragOver: (event: DragEvent) => {
        if (!accepts()) return;
        // Without this the browser refuses the drop.
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsOver(true);
      },
      onDragLeave: () => setIsOver(false),
      onDrop: (event: DragEvent) => {
        setIsOver(false);
        const { dragged, end } = useDragStore.getState();
        if (!dragged || !accepts()) return;

        event.preventDefault();
        event.stopPropagation();
        end();
        onDrop(dragged, target);
      },
    },
  };
}
