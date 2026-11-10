import { type DayKey, fromDayKey, startOfMonth, weekday } from "@cal/domain";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import { MINI_WEEKS, markedDays, miniMonthDays, WEEKDAY_LETTERS } from "../../lib/miniMonth";
import { dayNumber, formatMonth } from "../../lib/time";
import { jumpTo, ui, useUi } from "../../lib/ui";
import { yearColumns, yearMonths } from "../../lib/year";

const fullDate = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/*
 * Year view: the anchor's twelve months as mini months, four or three across so the
 * year fits under the toolbar, or scrolling in a narrow window. Each month's name opens
 * it in the month view; a day opens like a click in the sidebar's month, and a dot marks
 * days with events or blocks. Days outside a month are left blank, and weekends always
 * show, as in the mini month.
 */
export function YearView() {
  const { events, data, gridToday, account, zone } = useApp();
  const anchor = useUi((state) => state.anchor);
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 4, scroll: false });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = yearColumns(entry.contentRect.width, entry.contentRect.height);
      setLayout((now) => (now.columns === next.columns && now.scroll === next.scroll ? now : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The months draw at once; the dots follow when the year's events arrive.
  const marked = useMemo(
    () =>
      markedDays(
        [...events, ...data.blocks.map((block) => ({ start: block.start_at, end: block.end_at }))],
        zone,
      ),
    [events, data.blocks, zone],
  );
  // A weekend the week view hides opens in day view instead (see `jumpTo`).
  const jump = (day: DayKey) =>
    jumpTo(day, gridToday, !account.showWeekends && (weekday(day) === 0 || weekday(day) === 6));

  return (
    <div
      ref={ref}
      className={`min-h-0 flex-1 px-6 pt-1 pb-5 ${layout.scroll ? "overflow-y-auto" : "overflow-hidden"}`}
      data-year-view
    >
      <div
        className={`grid gap-x-8 gap-y-3 ${layout.scroll ? "" : "h-full"}`}
        style={{
          gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
          gridTemplateRows: layout.scroll ? undefined : `repeat(${12 / layout.columns}, 1fr)`,
        }}
      >
        {yearMonths(anchor).map((month) => (
          <Month
            key={month}
            month={month}
            weekStart={account.weekStart}
            today={gridToday}
            marked={marked}
            fixedRows={layout.scroll}
            onJump={jump}
          />
        ))}
      </div>
    </div>
  );
}

interface MonthProps {
  month: DayKey;
  weekStart: number;
  today: DayKey;
  marked: ReadonlySet<DayKey>;
  // Scrolling months keep a set row height; fitted ones share out the height they get.
  fixedRows: boolean;
  onJump: (day: DayKey) => void;
}

// One month: its name (opens the month view), the weekday letters, and six weeks.
function Month({ month, weekStart, today, marked, fixedRows, onJump }: MonthProps) {
  const flashDay = useUi((state) => state.flashDay);
  const cells = miniMonthDays(month, weekStart);
  const weeks = Array.from({ length: MINI_WEEKS }, (_, row) => cells.slice(row * 7, row * 7 + 7));
  const current = startOfMonth(today) === month;
  return (
    <section className="flex min-h-0 min-w-0 flex-col" data-year-month={month}>
      <div className="flex h-6 shrink-0 items-center">
        <button
          type="button"
          onClick={() => ui.set({ view: { kind: "month" }, anchor: month })}
          className={`-ml-1.5 h-6 truncate rounded-md px-1.5 text-body font-semibold hover:bg-hover ${
            current ? "text-now" : "text-ink"
          }`}
        >
          {formatMonth(month)}
        </button>
      </div>
      <div className="grid shrink-0 grid-cols-7" aria-hidden>
        {cells.slice(0, 7).map((day) => (
          <span
            key={day}
            className="flex h-5 items-center justify-center text-caption font-medium tracking-[0.02em] text-ink-3"
          >
            {WEEKDAY_LETTERS[fromDayKey(day).getDay()]}
          </span>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {weeks.map((week) => (
          <div key={week[0]} className={`grid grid-cols-7 ${fixedRows ? "h-7" : "min-h-6 flex-1"}`}>
            {week.map((day) =>
              day.slice(0, 7) === month.slice(0, 7) ? (
                <Day
                  key={day}
                  day={day}
                  today={day === today}
                  marked={marked.has(day)}
                  flash={day === flashDay}
                  onJump={onJump}
                />
              ) : (
                <span key={day} />
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

interface DayProps {
  day: DayKey;
  today: boolean;
  marked: boolean;
  flash: boolean;
  onJump: (day: DayKey) => void;
}

// One day: today is the red badge, a dot under the number marks a busy day, and a jump
// here (`T`) flashes the cell.
function Day({ day, today, marked, flash, onJump }: DayProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={fullDate.format(fromDayKey(day))}
      aria-current={today ? "date" : undefined}
      onClick={() => onJump(day)}
      className="group relative flex items-center justify-center"
      data-year-day={day}
    >
      {flash && (
        <span
          className="flash-out pointer-events-none absolute inset-0 rounded-md bg-accent-soft"
          onAnimationEnd={() => ui.set({ flashDay: null })}
        />
      )}
      <span
        className={`relative flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-small tnum ${
          today ? "bg-now font-semibold text-white" : "text-ink group-hover:bg-hover"
        }`}
      >
        {dayNumber(day)}
        {/* Today's badge already says it; the dot would sit on its edge. */}
        {marked && !today && (
          <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink-3" />
        )}
      </span>
    </button>
  );
}
