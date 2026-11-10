import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { Keycaps } from "./ui";

/*
 * A small menu that pops from a button (the sidebar's + and the to-do bar's Move):
 * a raised surface with 28px rows, each with an optional icon and shortcut. It takes
 * focus when it opens; ↑/↓ move between rows, Enter runs one, Escape closes. The owner
 * positions it and closes it on an outside click with `useDismiss`.
 */

export interface PopMenuItem {
  id: string;
  label: string;
  // A 16px icon that sets its own color.
  icon?: ReactNode;
  // A binding shown as keycaps, e.g. "mod+alt+n".
  keys?: string;
  // Separator before this item.
  divider?: boolean;
  run: () => void;
}

interface PopMenuProps {
  label: string;
  items: readonly PopMenuItem[];
  onClose: () => void;
  // Placement and transform origin, e.g. "bottom-full left-0 mb-1 origin-bottom-left".
  className: string;
}

export function PopMenu({ label, items, onClose, className }: PopMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, []);

  // Moves focus `step` rows from the focused one, wrapping at the ends.
  const move = (step: 1 | -1) => {
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const index = rows.findIndex((row) => row === document.activeElement);
    rows[(index + step + rows.length) % rows.length]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      // Keys stay inside the menu, so Enter and the arrows never reach the window's commands.
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") onClose();
        else if (event.key === "ArrowDown") move(1);
        else if (event.key === "ArrowUp") move(-1);
        else return;
        event.preventDefault();
      }}
      className={`pop-in absolute z-30 max-h-80 w-52 overflow-y-auto rounded-lg bg-raised p-1 shadow-float ${className}`}
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.divider && <div className="my-1 h-px bg-grid" />}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.run();
            }}
            className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-body text-ink outline-none hover:bg-hover focus-visible:bg-hover [&>svg]:shrink-0"
          >
            {item.icon}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.keys && <Keycaps binding={item.keys} />}
          </button>
        </div>
      ))}
    </div>
  );
}

// Calls `close` on a press outside `ref` while `open`, so the owning button still toggles.
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) close();
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [ref, open, close]);
}
