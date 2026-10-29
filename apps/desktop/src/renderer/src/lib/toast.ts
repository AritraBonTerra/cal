import { createStore, useStore } from "./store";

/*
 * One transient message at the bottom of the window ("Event deleted · Undo"). A new
 * toast replaces the last; each one clears itself after a few seconds.
 */

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

const TOAST_MS = 6000;

export const toasts = createStore<{ toast: Toast | null }>({ toast: null });

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, action?: Toast["action"]) {
  const id = nextId++;
  toasts.set({ toast: { id, message, action } });
  clearTimeout(timer);
  timer = setTimeout(() => dismissToast(id), TOAST_MS);
}

// Clears the toast if it's still the one shown.
export function dismissToast(id: number) {
  toasts.set((state) => (state.toast?.id === id ? { toast: null } : {}));
}

export const useToast = () => useStore(toasts, (state) => state.toast);
