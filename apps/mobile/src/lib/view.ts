import { accountDefaults } from "@cal/app-core";
import { addDays, type DayKey, dayRange, startOfWeek } from "@cal/domain";
import { createStore, useStore } from "./store";

/*
 * What the calendar shows: how many days per page and the first day of the current
 * page. iPhone pages 1 or 3 days; iPad up to a week, which starts on the account's
 * "Start week on" day (`weekStart`, kept in step by AppProvider in lib/app.tsx).
 */
export interface ViewState {
  count: number;
  anchor: DayKey;
  // 0 = Sunday … 6 = Saturday.
  weekStart: number;
}

export const view = createStore<ViewState>({
  count: 1,
  anchor: "",
  weekStart: accountDefaults.weekStart,
});

export const useView = <R>(select: (state: ViewState) => R) => useStore(view, select);

// The first day of the page holding `day` for a `count`-day view.
const pageStart = (day: DayKey, count: number, weekStart: number) =>
  count === 7 ? startOfWeek(day, weekStart) : day;

// Shows `count` days starting at (the page of) `from`.
export function showDays(count: number, from: DayKey) {
  view.set(({ weekStart }) => ({ count, anchor: pageStart(from, count, weekStart) }));
}

/*
 * Follows the account's week start, re-aligning a week page like the Mac does: to
 * today's week when today is showing, otherwise to the week sharing most days with it.
 */
export function setWeekStart(weekStart: number, today: DayKey) {
  view.set(({ anchor, count }) => {
    if (count !== 7 || !anchor) return { weekStart };
    const base = dayRange(anchor, count).includes(today) ? today : addDays(anchor, 3);
    return { weekStart, anchor: pageStart(base, count, weekStart) };
  });
}

// Moves by whole pages.
export function movePages(pages: number) {
  view.set(({ anchor, count }) => ({ anchor: addDays(anchor, pages * count) }));
}

export const daysOf = ({ anchor, count }: ViewState) => dayRange(anchor, count);
