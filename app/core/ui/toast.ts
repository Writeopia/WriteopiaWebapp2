import { create } from "zustand";

export type ToastKind = "info" | "success" | "error";

export type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
  /** A button on the toast, like Undo. */
  action?: { label: string; onClick: () => void };
};

type ToastOptions = {
  kind?: ToastKind;
  action?: Toast["action"];
  /** How long the toast stays, in milliseconds. 0 keeps it until dismissed. */
  duration?: number;
};

type ToastState = {
  toasts: Toast[];
  show: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const DEFAULT_DURATION = 4000;
let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, { kind = "info", action, duration = DEFAULT_DURATION } = {}) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, message, kind, action }] }));
    if (duration > 0) setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Shows a toast from anywhere, inside a component or not. */
export function showToast(message: string, options?: ToastOptions): number {
  return useToastStore.getState().show(message, options);
}
