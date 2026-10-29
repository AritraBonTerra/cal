import type { ExternalEvent } from "@cal/calendar-source";
import {
  addDays,
  type DayKey,
  fromDayKey,
  type Project,
  snapMinutes,
  type Task,
  type TimeBlock,
} from "@cal/domain";
import { grid } from "@cal/theme";
import { deviceZone, zonedDayKey, zonedInstant, zonedMinutes } from "../../lib/zones";

/*
 * What the grid draws: device events and Cal's blocks, each cut into one segment per
 * visible day with minutes after midnight, so columns can lay them out the same way.
 * Minutes and days are wall-clock values in the grid's zone (`zone`, the device's by
 * default); pixel positions scale with the hour height the view measured.
 */

// The default hour height; the view's effective height is at least the fit height.
export const DEFAULT_HOUR = grid.hourHeight;
export const SNAP = grid.snapMinutes;
export const GUTTER = grid.gutterWidth;
// Width of each extra time-zone column left of the main gutter.
export const ZONE_COLUMN = 44;
export const DAY_MINUTES = 24 * 60;

// Hour heights the zoom keys step through; 0 is "fit the day to the window".
export const ZOOM_STEPS = [0, 32, 40, 48, 56, 64, 80, 96] as const;
export const MAX_HOUR = 96;

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

export const minutesOf = (date: Date, zone = deviceZone) => zonedMinutes(date, zone);

export const dayOf = (date: Date, zone = deviceZone) => zonedDayKey(date, zone);

// `minutes` after midnight on `day`, as an instant.
export const instant = (day: DayKey, minutes: number, zone = deviceZone) =>
  zonedInstant(day, minutes, zone);

// Whether [start, end) touches any of the days `first` through `last` (device zone).
export const withinDays = ({ start, end }: Span, first: DayKey, last: DayKey) =>
  end.getTime() > fromDayKey(first).getTime() &&
  start.getTime() < fromDayKey(addDays(last, 1)).getTime();

// The part of each span falling on each of `days`, for timed items only.
export function segments<T extends Span>(
  items: readonly T[],
  days: readonly DayKey[],
  zone = deviceZone,
) {
  const byDay = new Map<DayKey, Segment<T>[]>(days.map((day) => [day, []]));
  for (const item of items) {
    const firstDay = dayOf(item.start, zone);
    const lastDay = dayOf(new Date(item.end.getTime() - 1), zone);
    for (const day of days) {
      if (day < firstDay || day > lastDay) continue;
      const start = day === firstDay ? minutesOf(item.start, zone) : 0;
      const end =
        day === lastDay
          ? Math.max(start + 1, minutesOf(item.end, zone) || DAY_MINUTES)
          : DAY_MINUTES;
      byDay.get(day)?.push({ item, day, start, end: Math.max(end, start + SNAP) });
    }
  }
  return byDay;
}

export const pixelsFor = (minutes: number, hour: number) => (minutes / 60) * hour;

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
export const shifted = (
  date: Date,
  days: number,
  minutes: number,
  step: number,
  zone = deviceZone,
) =>
  instant(
    addDays(dayOf(date, zone), days),
    snapMinutes(minutesOf(date, zone) + minutes, step),
    zone,
  );

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
  zone = deviceZone,
): Span {
  if (kind === "move") {
    const start = shifted(item.start, days, minutes, step, zone);
    return { start, end: new Date(start.getTime() + item.end.getTime() - item.start.getTime()) };
  }
  if (kind === "end") {
    const end = shifted(item.end, days, minutes, step, zone);
    const floor = item.start.getTime() + SNAP * MINUTE;
    return { start: item.start, end: new Date(Math.max(floor, end.getTime())) };
  }
  const start = shifted(item.start, days, minutes, step, zone);
  const ceiling = item.end.getTime() - SNAP * MINUTE;
  return { start: new Date(Math.min(ceiling, start.getTime())), end: item.end };
}

/**
 * The hour height one zoom step in `direction` from `current` (the effective height):
 * the next ladder step above, or the next below, stopping at fit (0) when the step
 * would drop under the fit height.
 */
export function zoomStep(current: number, fit: number, direction: 1 | -1) {
  if (direction === 1) return ZOOM_STEPS.find((step) => step > current + 0.5) ?? MAX_HOUR;
  const below = [...ZOOM_STEPS].reverse().find((step) => step < current - 0.5) ?? 0;
  return below <= fit ? 0 : below;
}
