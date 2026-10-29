import { X } from "lucide-react";
import { dismissToast, useToast } from "../lib/toast";

// A dark pill at the bottom of the window with one optional action ("Undo"); slides in
// over 220ms and clears itself (research/07 §7.8).
export function Toast() {
  const toast = useToast();
  if (!toast) return null;
  return (
    <div
      role="status"
      data-toast
      className="toast-in fixed bottom-6 left-1/2 z-50 flex h-9 -translate-x-1/2 items-center gap-3 rounded-lg bg-ink pr-1 pl-3 text-small text-canvas shadow-float"
    >
      <span className="max-w-96 truncate">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            dismissToast(toast.id);
            toast.action?.run();
          }}
          className="h-7 rounded-md px-2 font-medium text-accent-soft hover:bg-[oklch(1_0_0/0.12)]"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismissToast(toast.id)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-[oklch(1_0_0/0.12)]"
      >
        <X size={12} strokeWidth={1.5} absoluteStrokeWidth />
      </button>
    </div>
  );
}
