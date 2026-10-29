import { type DayKey, toDayKey, weekday } from "@cal/domain";
import { useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import { graphite } from "../../lib/calendars";
import { openEdit } from "../../lib/events";
import { assignLanes } from "../../lib/layout";
import { dayNumber, formatMinutes, formatWeekday, weekNumber } from "../../lib/time";
import { select, showDays, useUi } from "../../lib/ui";
import { barColumns, dayOf, minutesOf, withinDays } from "./model";

const LINE = 20;
const NUMBER_ROW = 26;

// Width of the week-number column when the setting is on.
const WEEK_COLUMN = 32;

const isWeekend = (day: DayKey) => weekday(day) === 0 || weekday(day) === 6;

/*
 * Month view: six weeks of cells. All-day events run as bars across their days, timed
 * events and blocks are one line each with the start time, and what doesn't fit folds
 * into "+N more". Clicking a day number opens that day. Hidden weekends drop their
 * columns; week numbers get a narrow column on the left.
 */
export function MonthView() {
  const { days, events, gridToday, palette, mode, account, zone } = useApp();
  const anchor = useUi((state) => state.anchor);
  const selection = useUi((state) => state.selection);
  const month = anchor.slice(0, 7);
  const weekColumn = account.weekNumbers ? WEEK_COLUMN : 0;
  const ref = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(120);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setRowHeight(element.clientHeight / 6));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const weeks = Array.from({ length: 6 }, (_, index) =>
    days.slice(index * 7, index * 7 + 7).filter((day) => account.showWeekends || !isWeekend(day)),
  );
  const columns = weeks[0]?.length ?? 7;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-dense>
      <div className="flex shrink-0 border-b border-grid">
        {weekColumn > 0 && <div className="shrink-0" style={{ width: weekColumn }} />}
        {weeks[0]?.map((day) => (
          <div key={day} className="flex-1 px-2 py-1.5 text-small text-ink-2">
            {formatWeekday(day)}
          </div>
        ))}
      </div>
      <div ref={ref} className="flex min-h-0 flex-1 flex-col">
        {weeks.map((week) => {
          const first = week[0] ?? "";
          const bars = events
            .filter((event) => event.allDay)
            .flatMap((event) => {
              const startDay = toDayKey(new Date(event.start));
              const endDay = toDayKey(new Date(Date.parse(event.end) - 1));
              const columns = barColumns(week, startDay, endDay);
              return columns ? [{ event, ...columns }] : [];
            });
          const placed = assignLanes(bars);
          const lanes = placed.reduce((max, { lane }) => Math.max(max, lane + 1), 0);
          const capacity = Math.max(
            0,
            Math.floor((rowHeight - NUMBER_ROW - lanes * LINE - 4) / LINE),
          );
          return (
            <div key={first} className="flex min-h-0 flex-1 border-b border-grid">
              {weekColumn > 0 && (
                <div
                  className="flex shrink-0 justify-center pt-[5px] text-caption text-ink-3 tnum"
                  style={{ width: weekColumn }}
                >
                  {weekNumber(first, account.weekStart)}
                </div>
              )}
              <div className="relative flex min-w-0 flex-1">
                {week.map((day) => (
                  <Cell
                    key={day}
                    day={day}
                    inMonth={day.slice(0, 7) === month}
                    isToday={day === gridToday}
                    offset={lanes * LINE}
                    capacity={capacity}
                  />
                ))}
                {placed.map(({ item, lane }) => {
                  const colors = palette.get(item.event.calendarId) ?? graphite(mode);
                  const isSelected = selection?.kind === "event" && selection.id === item.event.id;
                  return (
                    <button
                      type="button"
                      key={item.event.id}
                      data-item={`event:${item.event.id}`}
                      onClick={() => {
                        select({ kind: "event", id: item.event.id });
                        openEdit(item.event, zone);
                      }}
                      className="absolute flex h-[18px] items-center truncate rounded-sm border-l-[3px] px-1.5 text-caption font-medium"
                      style={{
                        top: NUMBER_ROW + lane * LINE,
                        left: `calc(${(item.from / columns) * 100}% + 4px)`,
                        width: `calc(${((item.to - item.from + 1) / columns) * 100}% - 8px)`,
                        background: isSelected ? colors.solid : colors.fill,
                        borderColor: isSelected ? colors.solid : colors.bar,
                        color: isSelected ? "#ffffff" : colors.title,
                      }}
                    >
                      <span className="truncate">{item.event.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell({
  day,
  inMonth,
  isToday,
  offset,
  capacity,
}: {
  day: DayKey;
  inMonth: boolean;
  isToday: boolean;
  // Height taken by all-day bars above the timed items.
  offset: number;
  capacity: number;
}) {
  const { events, data, today, palette, mode, calendars, zone } = useApp();
  const selection = useUi((state) => state.selection);
  // Timed items touching this day in the grid's zone. One that began the day before
  // continues here and is labelled with when it ends.
  const onDay = (start: string, end: string) =>
    withinDays({ start: new Date(start), end: new Date(end) }, day, day, zone);
  const label = (start: Date, end: Date) =>
    dayOf(start, zone) === day
      ? formatMinutes(minutesOf(start, zone))
      : `–${formatMinutes(minutesOf(end, zone))}`;
  const timed = [
    ...events
      .filter((event) => !event.allDay && onDay(event.start, event.end))
      .map((event) => ({
        key: `event:${event.id}`,
        start: new Date(event.start),
        time: label(new Date(event.start), new Date(event.end)),
        title: event.title,
        color: (palette.get(event.calendarId) ?? graphite(mode)).bar,
        text: (palette.get(event.calendarId) ?? graphite(mode)).title,
        done: false,
        block: false,
        onClick: () => {
          select({ kind: "event", id: event.id });
          openEdit(event, zone);
        },
        selected: selection?.kind === "event" && selection.id === event.id,
        writable: calendars.find((c) => c.id === event.calendarId)?.writable ?? false,
      })),
    ...data.blocks
      .filter((block) => onDay(block.start_at, block.end_at))
      .map((block) => ({
        key: `block:${block.uuid}`,
        start: new Date(block.start_at),
        time: label(new Date(block.start_at), new Date(block.end_at)),
        title: data.tasks.find((task) => task.uuid === block.task_uuid)?.title ?? "Block",
        color: "var(--cal-edge-strong)",
        text: "var(--cal-ink)",
        done: block.done_at !== undefined,
        block: true,
        onClick: () => select({ kind: "block", uuid: block.uuid }),
        selected: selection?.kind === "block" && selection.uuid === block.uuid,
        writable: true,
      })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
  const visible = timed.slice(0, timed.length > capacity ? Math.max(0, capacity - 1) : capacity);
  const hidden = timed.length - visible.length;
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col border-l border-grid first:border-l-0 ${inMonth ? "" : "bg-offhours"}`}
      data-day={day}
    >
      <div className="flex h-[26px] items-center px-1.5">
        <button
          type="button"
          onClick={() => showDays(1, today, day)}
          className={`flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-small font-medium tnum ${
            isToday
              ? "bg-now text-white"
              : inMonth
                ? "text-ink hover:bg-hover"
                : "text-ink-3 hover:bg-hover"
          }`}
        >
          {dayNumber(day)}
        </button>
      </div>
      <div className="min-h-0 flex-1 px-1" style={{ paddingTop: offset }}>
        {visible.map((item) => (
          <button
            type="button"
            key={item.key}
            data-item={item.key}
            onClick={item.onClick}
            className={`flex h-[18px] w-full items-center gap-1.5 truncate rounded-sm px-1 text-caption ${
              item.selected ? "bg-accent-soft" : "hover:bg-hover"
            }`}
          >
            <span
              className={`h-2 w-2 shrink-0 ${item.block ? "rounded-xs border" : "rounded-full"}`}
              style={item.block ? { borderColor: item.color } : { background: item.color }}
            />
            <span className="shrink-0 text-ink-3 tnum">{item.time}</span>
            <span className={`truncate ${item.done ? "text-ink-3 line-through" : "text-ink"}`}>
              {item.title}
            </span>
          </button>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => showDays(1, today, day)}
            className="h-[18px] px-1 text-caption text-ink-3 tnum"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  );
}
