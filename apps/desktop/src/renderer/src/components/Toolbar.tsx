import type { DayKey } from "@cal/domain";
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/app";
import { formatMonthYear, formatSpan, weekNumber } from "../lib/time";
import {
  goToday,
  moveView,
  showDays,
  showMonth,
  showYear,
  toggleOverlay,
  ui,
  useUi,
} from "../lib/ui";
import { zoneCity } from "../lib/zones";
import { PANE_TOGGLES_END } from "./PaneToggles";
import { IconButton, Keycaps } from "./ui";

// The toolbar's own left padding (`pl-4`), and the gap it leaves after the pane toggles.
const PADDING = 16;
const GAP = 12;

/*
 * The band above the grid: the date title, Today, previous/next, the view picker and
 * ⌘K. With both panes hidden it's the leftmost band, so a spacer slides open to keep
 * the title clear of the traffic lights and the pane toggles beside them.
 */
export function Toolbar({ first, last }: { first: DayKey; last: DayKey }) {
  const { today, account } = useApp();
  const sidebar = useUi((state) => state.sidebar);
  const tasks = useUi((state) => state.tasks);
  const spacer = sidebar || tasks ? 0 : PANE_TOGGLES_END + GAP - PADDING;
  const view = useUi((state) => state.view);
  const anchor = useUi((state) => state.anchor);
  const travelZone = useUi((state) => state.travelZone);
  const title =
    view.kind === "month"
      ? formatMonthYear(anchor)
      : view.kind === "year"
        ? anchor.slice(0, 4)
        : formatSpan(first, last);
  const weeks =
    view.kind === "days" && account.weekNumbers
      ? [weekNumber(first, account.weekStart), weekNumber(last, account.weekStart)]
      : null;
  const label =
    view.kind === "month"
      ? "Month"
      : view.kind === "year"
        ? "Year"
        : view.count === 1
          ? "Day"
          : view.count === 7
            ? "Week"
            : `${view.count} days`;

  return (
    <header className="drag-region flex h-13 shrink-0 items-center gap-1 pr-3 pl-4">
      <div className="pane-slide shrink-0" style={{ width: spacer }} />
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

// `count` 0 is the month view and -1 the year view.
const CHOICES = [
  { label: "Day", keys: "1", count: 1 },
  { label: "3 days", keys: "3", count: 3 },
  { label: "Week", keys: "w", count: 7 },
  { label: "Month", keys: "m", count: 0 },
  { label: "Year", keys: "y", count: -1 },
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
        className="flex h-7 items-center gap-1 rounded-md pr-1.5 pl-2.5 text-small font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--cal-edge)] transition-colors duration-100 hover:bg-hover hover:duration-0"
      >
        {label}
        <ChevronDown size={12} strokeWidth={1.5} absoluteStrokeWidth className="text-ink-3" />
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
                if (choice.count === 0) showMonth(today);
                else if (choice.count < 0) showYear(today);
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
