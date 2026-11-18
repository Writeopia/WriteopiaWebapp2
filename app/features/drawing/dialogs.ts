import { create } from "zustand";

/** Which drawing the dialog edits: a new one, added after a block, or the one of a block. */
export type DrawingTarget =
  { kind: "new"; afterId: string | null } | { kind: "edit"; blockId: string };

type DrawingDialogState = {
  target: DrawingTarget | null;
  open: (target: DrawingTarget) => void;
  close: () => void;
};

export const useDrawingDialog = create<DrawingDialogState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
