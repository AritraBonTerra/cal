import { atMinute, type DayKey, minuteOfDay, toDayKey } from "./dates";

// A busy stretch of time: an event or a block, as instants.
export interface Interval {
  start: Date;
  end: Date;
}

export interface WorkingHours {
  // Minutes after midnight, e.g. 540–1080 for 9:00–18:00.
  start: number;
  end: number;
}

export const DEFAULT_WORKING_HOURS: WorkingHours = { start: 9 * 60, end: 18 * 60 };

/**
 * The earliest slot of `lengthMin` minutes on the day of `from` that starts at or after
 * `from` (rounded up to `step`), stays inside working hours and overlaps nothing in
 * `busy`. Undefined when the day is full, so nothing is ever squeezed in after hours.
 */
export function nextFreeSlot(
  busy: readonly Interval[],
  from: Date,
  lengthMin: number,
  hours = DEFAULT_WORKING_HOURS,
  step = 15,
): Interval | undefined {
  const day: DayKey = toDayKey(from);
  const ceil = (minute: number) => Math.ceil(minute / step) * step;
  const taken = busy
    .map((each) => ({ start: each.start.getTime(), end: each.end.getTime() }))
    .filter((each) => each.end > each.start)
    .sort((a, b) => a.start - b.start);
  let minute = Math.max(hours.start, ceil(minuteOfDay(from)));
  while (minute + lengthMin <= hours.end) {
    const start = atMinute(day, minute).getTime();
    const end = atMinute(day, minute + lengthMin).getTime();
    const clash = taken.find((each) => each.start < end && each.end > start);
    if (!clash) return { start: new Date(start), end: new Date(end) };
    // Jump past the clash, back onto the snap grid, in wall-clock minutes (elapsed time
    // since midnight differs on DST change days). A clash running into tomorrow ends the day.
    const clashEnd = new Date(clash.end);
    const after = toDayKey(clashEnd) > day ? Number.POSITIVE_INFINITY : ceil(minuteOfDay(clashEnd));
    minute = Math.max(minute + step, after);
  }
  return undefined;
}
