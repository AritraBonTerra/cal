/*
 * Calendar math in the device's local time zone.
 *
 * A `DayKey` is a floating date, `YYYY-MM-DD`, with no time zone: "When", deadlines,
 * habit days and grid columns all use it, so a task due Friday stays on Friday when
 * you fly. Instants are `Date`s, stored as ISO strings with an offset (`toOffsetIso`).
 */
export type DayKey = string;

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

export const toDayKey = (date: Date): DayKey =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Local midnight at the start of `key`.
export function fromDayKey(key: DayKey) {
  const [year = 1970, month = 1, day = 1] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export const isDayKey = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && toDayKey(fromDayKey(value)) === value;

export function addDays(key: DayKey, days: number) {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

// Whole days from `a` to `b` (positive when `b` is later), unaffected by DST changes.
export function daysBetween(a: DayKey, b: DayKey) {
  const utc = (key: DayKey) => {
    const [year = 1970, month = 1, day = 1] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

// 0 = Sunday … 6 = Saturday.
export const weekday = (key: DayKey) => fromDayKey(key).getDay();

// The first day of the week containing `key`; `weekStart` uses `weekday` numbering.
export const startOfWeek = (key: DayKey, weekStart = 1) =>
  addDays(key, -((weekday(key) - weekStart + 7) % 7));

export const startOfMonth = (key: DayKey) => `${key.slice(0, 7)}-01`;

export function daysInMonth(key: DayKey) {
  const date = fromDayKey(startOfMonth(key));
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// Moves by whole months, clamping the day (Jan 31 + 1 month = Feb 28/29).
export function addMonths(key: DayKey, months: number) {
  const date = fromDayKey(startOfMonth(key));
  date.setMonth(date.getMonth() + months);
  const month = toDayKey(date);
  const day = Math.min(Number(key.slice(8, 10)), daysInMonth(month));
  return `${month.slice(0, 8)}${pad(day)}`;
}

// `count` consecutive days starting at `start`.
export const dayRange = (start: DayKey, count: number) =>
  Array.from({ length: count }, (_, index) => addDays(start, index));

/**
 * The day it is for the user: before `dayStartHour` (e.g. 4 for 04:00) it's still
 * yesterday, so late-night work counts toward the day you started it.
 */
export const logicalToday = (now: Date, dayStartHour = 0) =>
  toDayKey(new Date(now.getTime() - dayStartHour * 3_600_000));

// The local instant `minutes` after midnight on `key` (may cross into the next day).
export function atMinute(key: DayKey, minutes: number) {
  const date = fromDayKey(key);
  date.setMinutes(minutes);
  return date;
}

export const minuteOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

export const snapMinutes = (minutes: number, step: number) => Math.round(minutes / step) * step;

// An ISO 8601 string in local time with its UTC offset, e.g. `2026-10-28T10:40:00-07:00`.
export function toOffsetIso(date: Date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${toDayKey(date)}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
