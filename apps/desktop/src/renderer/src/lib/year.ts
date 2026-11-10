import { addMonths, type DayKey, dayRange, daysBetween } from "@cal/domain";

/*
 * The year view: which year a day is in, the days it fetches events for, its twelve
 * months, and how many months go across in the room it has.
 */

export const startOfYear = (day: DayKey) => `${day.slice(0, 4)}-01-01`;

export const sameYear = (a: DayKey, b: DayKey) => a.slice(0, 4) === b.slice(0, 4);

// The 1st of each month of `day`'s year.
export const yearMonths = (day: DayKey) =>
  Array.from({ length: 12 }, (_, index) => addMonths(startOfYear(day), index));

// Every day of `day`'s year, January 1st through December 31st.
export function yearDays(day: DayKey) {
  const first = startOfYear(day);
  return dayRange(first, daysBetween(first, addMonths(first, 12)));
}

// The least room a month takes, its share of the gaps included: seven 24px columns
// across; a title, the weekday letters and six 24px weeks down.
export const MONTH_MIN = { width: 200, height: 204 };

/**
 * How many months go across an area `width` × `height`: four (three rows) or three
 * (four rows), whichever is widest and fits without scrolling. When neither fits, as
 * many as fit across (two in a narrow window, one beside both panes), and it scrolls.
 */
export function yearColumns(width: number, height: number) {
  const fits = (columns: number) =>
    width / columns >= MONTH_MIN.width && height / (12 / columns) >= MONTH_MIN.height;
  const fitting = [4, 3].find(fits);
  if (fitting) return { columns: fitting, scroll: false };
  const across = [4, 3, 2].find((columns) => width / columns >= MONTH_MIN.width) ?? 1;
  return { columns: across, scroll: true };
}
