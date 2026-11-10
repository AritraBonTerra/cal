import { addDays, type DayKey, dayRange, startOfMonth, startOfWeek, toDayKey } from "@cal/domain";
import { zonedDayKey } from "./zones";

/*
 * The sidebar's mini month: which days it shows, which have something on them, and how
 * the band marking the main calendar's visible days is drawn.
 */

export const MINI_WEEKS = 6;

// Six weeks from the week holding `month`'s 1st, so the grid keeps one height as it pages.
export const miniMonthDays = (month: DayKey, weekStart: number) =>
  dayRange(startOfWeek(startOfMonth(month), weekStart), MINI_WEEKS * 7);

// A day longer than this is still marked only this far, so a stray span can't stall a render.
const MAX_SPAN_DAYS = 366;

/**
 * Days that have an event or block on them, as the grid shows them: a timed span marks
 * each day it touches in `zone`; an all-day event marks its local days, as the all-day
 * row draws it. A span ending at midnight doesn't mark the next day.
 */
export function markedDays(
  spans: readonly { start: string; end: string; allDay?: boolean }[],
  zone: string,
) {
  const marked = new Set<DayKey>();
  for (const span of spans) {
    const start = new Date(span.start);
    const end = new Date(Math.max(start.getTime(), Date.parse(span.end) - 1));
    const first = span.allDay ? toDayKey(start) : zonedDayKey(start, zone);
    const last = span.allDay ? toDayKey(end) : zonedDayKey(end, zone);
    let day = first;
    for (let count = 0; day <= last && count < MAX_SPAN_DAYS; count++) {
      marked.add(day);
      day = addDays(day, 1);
    }
  }
  return marked;
}

/**
 * For each cell of a week row, whether it's banded and whether the band starts or ends
 * there, so a run of visible days reads as one rounded bar per row.
 */
export function bandRow(week: readonly DayKey[], visible: ReadonlySet<DayKey>) {
  return week.map((day, index) => {
    const on = visible.has(day);
    const before = index > 0 && visible.has(week[index - 1] ?? "");
    const after = index < week.length - 1 && visible.has(week[index + 1] ?? "");
    return { on, start: on && !before, end: on && !after };
  });
}
