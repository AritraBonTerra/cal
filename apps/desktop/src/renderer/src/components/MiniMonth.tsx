import { useSettings } from "@cal/app-core";
import {
  addDays,
  addMonths,
  type DayKey,
  fromDayKey,
  startOfMonth,
  toOffsetIso,
} from "@cal/domain";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/app";
import { useEvents, visibleEvents } from "../lib/calendars";
import { bandRow, MINI_WEEKS, markedDays, miniMonthDays } from "../lib/miniMonth";
import { dayNumber, formatMonthYear } from "../lib/time";
import { goToday, useUi } from "../lib/ui";

/*
 * The month at the top of the sidebar (Notion Calendar's). The days the main calendar
 * shows are banded, today is a red square, and a dot marks days with events or blocks.
 * Click a day to show it in the calendar; the chevrons page this month only, and it
 * follows the calendar back when that moves to another month. The title collapses it.
 */

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const fullDate = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const CHEVRON = { size: 14, strokeWidth: 1.5, absoluteStrokeWidth: true } as const;

export function MiniMonth() {
  const { days, gridToday, data, account, device, zone } = useApp();
  const { setDevice } = useSettings();
  const view = useUi((state) => state.view);
  const anchor = useUi((state) => state.anchor);
  // The month the calendar is in: the month view's, or the first visible day's.
  const followed = startOfMonth(view.kind === "month" ? anchor : (days[0] ?? gridToday));
  const [month, setMonth] = useState(followed);
  useEffect(() => setMonth(followed), [followed]);

  const open = device.showMiniMonth;
  const cells = miniMonthDays(month, account.weekStart);
  const first = cells[0] ?? month;
  const last = cells[cells.length - 1] ?? month;
  // A day either side, since the grid's zone can put an event on a neighboring day.
  const { events: fetched } = useEvents(
    toOffsetIso(fromDayKey(addDays(first, -1))),
    toOffsetIso(fromDayKey(addDays(last, 2))),
  );
  const marked = useMemo(
    () =>
      markedDays(
        [
          ...visibleEvents(fetched, device.hiddenCalendars, account.showDeclined),
          ...data.blocks.map((block) => ({ start: block.start_at, end: block.end_at })),
        ],
        zone,
      ),
    [fetched, device.hiddenCalendars, account.showDeclined, data.blocks, zone],
  );
  // In month view the band covers that month, not the neighboring days its grid shows.
  const visible = new Set(
    view.kind === "month" ? days.filter((day) => day.slice(0, 7) === anchor.slice(0, 7)) : days,
  );
  const weeks = Array.from({ length: MINI_WEEKS }, (_, row) => cells.slice(row * 7, row * 7 + 7));

  return (
    <div className="shrink-0 px-3 pb-2" data-mini-month>
      <div className="flex h-7 items-center gap-1 pl-1">
        <button
          type="button"
          onClick={() => setDevice("showMiniMonth", !open)}
          aria-expanded={open}
          title={open ? "Hide month" : "Show month"}
          className="group flex min-w-0 flex-1 items-center gap-1 text-left text-small font-medium text-ink"
        >
          <span className="truncate tnum">{formatMonthYear(month)}</span>
          <ChevronDown
            {...CHEVRON}
            className={`shrink-0 text-ink-3 ${open ? "invisible group-hover:visible" : "-rotate-90"}`}
          />
        </button>
        {open && (
          <>
            <PageButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft {...CHEVRON} />
            </PageButton>
            <PageButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight {...CHEVRON} />
            </PageButton>
          </>
        )}
      </div>
      {open && (
        <div>
          <div className="grid grid-cols-7" aria-hidden>
            {cells.slice(0, 7).map((day) => (
              <span
                key={day}
                className="flex h-6 items-center justify-center text-caption font-medium tracking-[0.02em] text-ink-3"
              >
                {LETTERS[fromDayKey(day).getDay()]}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7">
              {bandRow(week, visible).map((band, index) => {
                const day = week[index] ?? month;
                return (
                  <Day
                    key={day}
                    day={day}
                    inMonth={day.slice(0, 7) === month.slice(0, 7)}
                    today={day === gridToday}
                    marked={marked.has(day)}
                    band={band}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DayProps {
  day: DayKey;
  inMonth: boolean;
  today: boolean;
  marked: boolean;
  band: { on: boolean; start: boolean; end: boolean };
}

// One day: banded when the calendar shows it; click jumps there and flashes it.
function Day({ day, inMonth, today, marked, band }: DayProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={fullDate.format(fromDayKey(day))}
      aria-current={today ? "date" : undefined}
      onClick={() => goToday(day)}
      className={`relative flex h-6 items-center justify-center text-caption tnum ${
        band.on ? "bg-active" : "hover:bg-hover rounded-md"
      } ${band.start ? "rounded-l-md" : ""} ${band.end ? "rounded-r-md" : ""}`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-md ${
          today ? "bg-now font-semibold text-white" : inMonth ? "text-ink" : "text-ink-3"
        }`}
      >
        {dayNumber(day)}
      </span>
      {/* Today's square already says it; the dot would sit on its edge. */}
      {marked && !today && (
        <span className="absolute bottom-px left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink-3" />
      )}
    </button>
  );
}

function PageButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-2 transition-colors duration-100 hover:bg-hover hover:duration-0 active:bg-active"
    >
      {children}
    </button>
  );
}
