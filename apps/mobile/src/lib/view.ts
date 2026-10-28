import { addDays, type DayKey, dayRange, startOfWeek } from "@cal/domain";
import { createStore, useStore } from "./store";

/*
 * What the calendar shows: how many days per page and the first day of the current
 * page. iPhone pages 1 or 3 days; iPad up to a week (which always starts on Monday).
 */
export interface ViewState {
  count: number;
  anchor: DayKey;
}

export const view = createStore<ViewState>({ count: 1, anchor: "" });

export const useView = <R>(select: (state: ViewState) => R) => useStore(view, select);

// The first day of the page holding `day` for a `count`-day view.
export const pageStart = (day: DayKey, count: number) => (count === 7 ? startOfWeek(day) : day);

// Shows `count` days starting at (the page of) `from`.
export function showDays(count: number, from: DayKey) {
  view.set({ count, anchor: pageStart(from, count) });
}

// Moves by whole pages.
export function movePages(pages: number) {
  view.set(({ anchor, count }) => ({ anchor: addDays(anchor, pages * count) }));
}

export const daysOf = ({ anchor, count }: ViewState) => dayRange(anchor, count);
