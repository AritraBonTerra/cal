import type { ExternalEvent } from "@cal/calendar-source";
import {
  addDays,
  type DayKey,
  fromDayKey,
  type Project,
  snapMinutes,
  type Task,
  type TimeBlock,
  toDayKey,
} from "@cal/domain";
import { grid } from "@cal/theme";

/*
 * What the grid draws: device events and Cal's blocks, each cut into one segment per
 * visible day with minutes after midnight, so columns can lay them out the same way.
 */

export const HOUR = grid.hourHeight;
export const SNAP = grid.snapMinutes;
export const GUTTER = grid.gutterWidth;
export const DAY_MINUTES = 24 * 60;

export type Item =
  | { kind: "event"; id: string; event: ExternalEvent; start: Date; end: Date }
  | {
      kind: "block";
      id: string;
      block: TimeBlock;
      task?: Task;
      project?: Project;
      start: Date;
      end: Date;
    };

// Anything with a start and end instant: an item, a draft, or a create gesture.
export interface Span {
  start: Date;
  end: Date;
}

export interface Segment<T extends Span = Item> {
  item: T;
  day: DayKey;
  // Minutes after midnight within `day`.
  start: number;
  end: number;
}

export const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

// `minutes` after midnight on `day`, as an instant.
export function instant(day: DayKey, minutes: number) {
  const date = fromDayKey(day);
  date.setMinutes(minutes);
  return date;
}

// Whether [start, end) touches any of the days `first` through `last`.
export const withinDays = ({ start, end }: Span, first: DayKey, last: DayKey) =>
  end.getTime() > fromDayKey(first).getTime() &&
  start.getTime() < fromDayKey(addDays(last, 1)).getTime();

// The part of each span falling on each of `days`, for timed items only.
export function segments<T extends Span>(items: readonly T[], days: readonly DayKey[]) {
  const byDay = new Map<DayKey, Segment<T>[]>(days.map((day) => [day, []]));
  for (const item of items) {
    const firstDay = toDayKey(item.start);
    const lastDay = toDayKey(new Date(item.end.getTime() - 1));
    for (const day of days) {
      if (day < firstDay || day > lastDay) continue;
      const start = day === firstDay ? minutesOf(item.start) : 0;
      const end =
        day === lastDay ? Math.max(start + 1, minutesOf(item.end) || DAY_MINUTES) : DAY_MINUTES;
      byDay.get(day)?.push({ item, day, start, end: Math.max(end, start + SNAP) });
    }
  }
  return byDay;
}

export const pixelsFor = (minutes: number) => (minutes / 60) * HOUR;

export const snap = (minutes: number, step: number = SNAP) =>
  Math.min(DAY_MINUTES, Math.max(0, Math.round(minutes / step) * step));

const MINUTE = 60_000;

/**
 * The span a create drag covers: from the pressed cell to the pointer in either
 * direction, across days if need be, and never shorter than one snap step.
 */
export function dragSpan(anchor: Date, pointer: Date): Span {
  const floor = new Date(anchor.getTime() + SNAP * MINUTE);
  return {
    start: new Date(Math.min(anchor.getTime(), pointer.getTime())),
    end: new Date(Math.max(floor.getTime(), pointer.getTime())),
  };
}

/**
 * `date` moved by the pointer's whole-day and minute deltas, snapped to `step`. Days and
 * minutes stay separate so an item keeps its wall-clock time across a DST change, and
 * the minute delta may cross midnight in either direction.
 */
export const shifted = (date: Date, days: number, minutes: number, step: number) =>
  instant(addDays(toDayKey(date), days), snapMinutes(minutesOf(date) + minutes, step));

/**
 * Where a move or resize gesture puts `item`, given how far the pointer travelled. A
 * resize moves one endpoint as a full instant and keeps at least one snap step between
 * start and end, so items crossing midnight resize like any other.
 */
export function dragged(
  item: Span,
  kind: "move" | "start" | "end",
  days: number,
  minutes: number,
  step: number,
): Span {
  if (kind === "move") {
    const start = shifted(item.start, days, minutes, step);
    return { start, end: new Date(start.getTime() + item.end.getTime() - item.start.getTime()) };
  }
  if (kind === "end") {
    const end = shifted(item.end, days, minutes, step);
    const floor = item.start.getTime() + SNAP * MINUTE;
    return { start: item.start, end: new Date(Math.max(floor, end.getTime())) };
  }
  const start = shifted(item.start, days, minutes, step);
  const ceiling = item.end.getTime() - SNAP * MINUTE;
  return { start: new Date(Math.min(ceiling, start.getTime())), end: item.end };
}
