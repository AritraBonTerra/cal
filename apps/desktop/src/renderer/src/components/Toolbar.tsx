import type { DayKey } from "@cal/domain";
import { ChevronLeft, ChevronRight, PanelLeft, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/app";
import { formatMonthYear, formatSpan } from "../lib/time";
import { goToday, moveView, showDays, showMonth, toggleOverlay, ui, useUi } from "../lib/ui";
import { IconButton, Keycaps } from "./ui";

/*
 * The band above the grid: the date title, Today, previous/next, the view picker and
 * ⌘K. It's the window's drag region when the sidebar is hidden, so it keeps clear of
 * the traffic lights.
 */
export function Toolbar({ first, last }: { first: DayKey; last: DayKey }) {
  const { today } = useApp();
  const sidebar = useUi((state) => state.sidebar);
  const view = useUi((state) => state.view);
  const anchor = useUi((state) => state.anchor);
  const title = view.kind === "month" ? formatMonthYear(anchor) : formatSpan(first, last);
  const label =
    view.kind === "month"
      ? "Month"
      : view.count === 1
        ? "Day"
        : view.count === 7
          ? "Week"
          : `${view.count} days`;

  return (
    <header
      className={`drag-region flex h-13 shrink-0 items-center gap-1 pr-3 ${sidebar ? "pl-4" : "pl-20"}`}
    >
      {!sidebar && (
        <IconButton
          label="Show sidebar (⌘\\)"
          onClick={() => ui.set({ sidebar: true })}
          className="mr-1"
        >
          <PanelLeft size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </IconButton>
      )}
      <h1 className="mr-2 truncate text-title-1 font-bold text-ink tnum">{title}</h1>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => goToday(today)}
        className="no-drag h-7 rounded-md px-2.5 text-small font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--cal-edge)] transition-colors duration-100 hover:bg-hover hover:duration-0 active:bg-active"
      >
        Today
      </button>
      <IconButton label="Previous (←)" onClick={() => moveView(-1)}>
        <ChevronLeft size={16} strokeWidth={1.5} absoluteStrokeWidth />
      </IconButton>
      <IconButton label="Next (→)" onClick={() => moveView(1)}>
        <ChevronRight size={16} strokeWidth={1.5} absoluteStrokeWidth />
      </IconButton>
      <ViewMenu label={label} />
      <IconButton
        label="Command menu (⌘K)"
        onClick={() => toggleOverlay("palette")}
        className="ml-1"
      >
        <Search size={16} strokeWidth={1.5} absoluteStrokeWidth />
      </IconButton>
    </header>
  );
}

const CHOICES = [
  { label: "Day", keys: "1", count: 1 },
  { label: "3 days", keys: "3", count: 3 },
  { label: "Week", keys: "w", count: 7 },
  { label: "Month", keys: "m", count: 0 },
];

// A small popover with the common spans; any other count comes from ⌘K ("Show 14 days").
function ViewMenu({ label }: { label: string }) {
  const { today } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={ref} className="no-drag relative ml-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="h-7 min-w-16 rounded-md px-2.5 text-small font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--cal-edge)] transition-colors duration-100 hover:bg-hover hover:duration-0"
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="pop-in absolute right-0 top-8 z-30 w-44 origin-top-right rounded-lg bg-raised p-1 shadow-float"
        >
          {CHOICES.map((choice) => (
            <button
              type="button"
              role="menuitem"
              key={choice.label}
              onClick={() => {
                setOpen(false);
                if (choice.count === 0) showMonth();
                else showDays(choice.count, today);
              }}
              className="flex h-7 w-full items-center justify-between rounded-md px-2 text-body text-ink hover:bg-hover"
            >
              {choice.label}
              <Keycaps binding={choice.keys} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
