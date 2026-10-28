import type { ExternalEvent } from "@cal/calendar-source";
import { type DayKey, type Project, type Task, type TimeBlock, toDayKey } from "@cal/domain";
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

export interface Segment {
  item: Item;
  day: DayKey;
  // Minutes after midnight within `day`.
  start: number;
  end: number;
}

export const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

const midnight = (day: DayKey) => {
  const [year = 1970, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
};

// `minutes` after midnight on `day`, as an instant.
export function instant(day: DayKey, minutes: number) {
  const date = midnight(day);
  date.setMinutes(minutes);
  return date;
}

// The part of an item falling on each of `days`, for timed items only.
export function segments(items: readonly Item[], days: readonly DayKey[]) {
  const byDay = new Map<DayKey, Segment[]>(days.map((day) => [day, []]));
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
