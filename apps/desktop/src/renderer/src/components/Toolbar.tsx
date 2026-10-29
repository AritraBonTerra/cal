import type { DayKey } from "@cal/domain";
import { ChevronLeft, ChevronRight, PanelLeft, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/app";
import { formatMonthYear, formatSpan, weekNumber } from "../lib/time";
import { goToday, moveView, showDays, showMonth, toggleOverlay, ui, useUi } from "../lib/ui";
import { zoneCity } from "../lib/zones";
import { IconButton, Keycaps } from "./ui";

/*
 * The band above the grid: the date title, Today, previous/next, the view picker and
 * ⌘K. It's the window's drag region when the sidebar is hidden, so it keeps clear of
 * the traffic lights: a spacer slides open in step with the sidebar so the title
 * never jumps.
 */
export function Toolbar({ first, last }: { first: DayKey; last: DayKey }) {
  const { today, account } = useApp();
  const sidebar = useUi((state) => state.sidebar);
  const tasks = useUi((state) => state.tasks);
  // Room for the show-sidebar button, plus the traffic lights when nothing else covers them.
  const spacer = sidebar ? 0 : tasks ? 36 : 96;
  const view = useUi((state) => state.view);
  const anchor = useUi((state) => state.anchor);
  const travelZone = useUi((state) => state.travelZone);
  const title = view.kind === "month" ? formatMonthYear(anchor) : formatSpan(first, last);
  const weeks =
    view.kind === "days" && account.weekNumbers
      ? [weekNumber(first, account.weekStart), weekNumber(last, account.weekStart)]
      : null;
  const label =
    view.kind === "month"
      ? "Month"
      : view.count === 1
        ? "Day"
        : view.count === 7
          ? "Week"
          : `${view.count} days`;

  return (
    <header className="drag-region flex h-13 shrink-0 items-center gap-1 pr-3 pl-4">
      <div
        className="pane-slide flex shrink-0 justify-end overflow-hidden"
        style={{ width: spacer }}
        inert={sidebar}
      >
        <div className="flex shrink-0 justify-end pr-1">
          <IconButton label="Show sidebar (⌘\\)" onClick={() => ui.set({ sidebar: true })}>
            <PanelLeft size={16} strokeWidth={1.5} absoluteStrokeWidth />
          </IconButton>
        </div>
      </div>
      <h1 className="mr-2 truncate text-title-1 font-bold text-ink tnum">{title}</h1>
      {weeks && (
        <span className="mt-1 shrink-0 text-small text-ink-3 tnum" data-week-number>
          {weeks[0] === weeks[1] ? `Week ${weeks[0]}` : `Weeks ${weeks[0]}–${weeks[1]}`}
        </span>
      )}
      {travelZone && (
        <button
          type="button"
          onClick={() => ui.set({ travelZone: null })}
          title="Stop travelling (Esc)"
          className="no-drag ml-2 flex h-6 shrink-0 items-center gap-1 rounded-full bg-now pr-1.5 pl-2.5 text-caption font-medium text-white"
          data-travel
        >
          {zoneCity(travelZone)} time
          <X size={12} strokeWidth={2} absoluteStrokeWidth />
        </button>
      )}
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
