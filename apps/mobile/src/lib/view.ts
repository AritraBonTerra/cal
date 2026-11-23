import { accountDefaults } from "@cal/app-core";
import { addDays, type DayKey, dayRange, daysBetween, startOfWeek } from "@cal/domain";
import { createStore, useStore } from "./store";

/*
 * What the calendar shows: the agenda, or a page of days. Days: how many per page and
 * the first day of the current page. iPhone pages 1 or 3 days; iPad up to a week, which
 * starts on the account's "Start week on" day (`weekStart`, kept in step by AppProvider
 * in lib/app.tsx). The agenda is a list of days from the anchor that grows as it's
 * scrolled.
 */
export interface ViewState {
  kind: "agenda" | "days";
  count: number;
  anchor: DayKey;
  // 0 = Sunday … 6 = Saturday.
  weekStart: number;
  // How many days the agenda lists.
  span: number;
  // The agenda's current day: the one tapped, then whichever scrolls to the top.
  selected: DayKey;
  // The last day jumped to, listed even when there's nothing on it.
  pinned: DayKey;
  // A day in the week or month the strip above the agenda shows.
  focus: DayKey;
  // Whether that strip is pulled down to a month.
  month: boolean;
  // Counts jumps, so one to the day already selected scrolls back to it.
  jumps: number;
}

export const view = createStore<ViewState>({
  kind: "days",
  count: 1,
  anchor: "",
  weekStart: accountDefaults.weekStart,
  span: 30,
  selected: "",
  pinned: "",
  focus: "",
  month: false,
  jumps: 0,
});

export const useView = <R>(select: (state: ViewState) => R) => useStore(view, select);

// The first day of the page holding `day` for a `count`-day view.
const pageStart = (day: DayKey, count: number, weekStart: number) =>
  count === 7 ? startOfWeek(day, weekStart) : day;

// Changes how many days a page holds, leaving the agenda showing if it is.
export function setCount(count: number) {
  view.set(({ anchor, weekStart, kind }) => ({
    count,
    anchor: kind === "days" ? pageStart(anchor, count, weekStart) : anchor,
  }));
}

// Shows `count` days starting at (the page of) `from`.
export function showDays(count: number, from: DayKey) {
  view.set(({ weekStart }) => ({
    kind: "days",
    count,
    anchor: pageStart(from, count, weekStart),
  }));
}

// Days the agenda grows by, and the most it lists.
const AGENDA_STEP = 30;
export const AGENDA_MAX = 366;

// Shows the agenda as a list starting on `day`.
export function showAgenda(day: DayKey) {
  view.set(({ jumps }) => ({
    kind: "agenda",
    anchor: day,
    span: AGENDA_STEP,
    selected: day,
    pinned: day,
    focus: day,
    jumps: jumps + 1,
  }));
}

// Goes to `day` in the agenda: scrolls there when it's listed, else starts over from it.
export function jumpAgenda(day: DayKey) {
  const { kind, anchor, span, jumps } = view.get();
  const ahead = daysBetween(anchor, day);
  if (kind !== "agenda" || ahead < 0 || ahead >= span) showAgenda(day);
  else view.set({ selected: day, pinned: day, focus: day, jumps: jumps + 1 });
}

// Adds days to the end of the agenda.
export function extendAgenda() {
  view.set(({ span }) => ({ span: Math.min(AGENDA_MAX, span + AGENDA_STEP) }));
}

// Marks the day the agenda was scrolled to, bringing the strip along.
export function followAgenda(day: DayKey) {
  if (view.get().selected !== day) view.set({ selected: day, focus: day });
}

// Pages the strip to the week or month holding `day`.
export const focusAgenda = (day: DayKey) => view.set({ focus: day });

// Pulls the strip down to a month, or back up to a week.
export const setMonth = (month: boolean) => view.set({ month });

/*
 * Follows the account's week start, re-aligning a week page like the Mac does: to
 * today's week when today is showing, otherwise to the week sharing most days with it.
 */
export function setWeekStart(weekStart: number, today: DayKey) {
  view.set(({ kind, anchor, count }) => {
    if (kind === "agenda" || count !== 7 || !anchor) return { weekStart };
    const base = dayRange(anchor, count).includes(today) ? today : addDays(anchor, 3);
    return { weekStart, anchor: pageStart(base, count, weekStart) };
  });
}

// Moves by whole pages.
export function movePages(pages: number) {
  view.set(({ anchor, count }) => ({ anchor: addDays(anchor, pages * count) }));
}

export const daysOf = ({ anchor, count }: ViewState) => dayRange(anchor, count);
