import { type DayKey, fromDayKey } from "@cal/domain";

/*
 * Time and date text. Hour labels are compact ("9 AM"), chip ranges use an en dash with
 * no spaces and show AM/PM once ("9:30–10:15 AM"), and durations read "1h30".
 */

const systemHour12 =
  new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ?? true;

// The clock every time label follows: the Mac's, or forced by the Time format setting.
let hour12 = systemHour12;

/**
 * Applies the Time format setting. Called at the top of the App render so every label
 * below it formats the same way in that render; assigning the same value again is a no-op.
 */
export function setTimeFormat(format: "system" | "12h" | "24h") {
  hour12 = format === "system" ? systemHour12 : format === "12h";
}

export const usesHour12 = () => hour12;

const pad = (value: number) => String(value).padStart(2, "0");

const meridiem = (hours: number) => (hours < 12 ? "AM" : "PM");

// "9 AM", "12 PM", or "09:00" with a 24-hour clock.
export function formatHour(hour: number) {
  if (!hour12) return `${pad(hour)}:00`;
  const h = hour % 12 || 12;
  return `${h} ${meridiem(hour)}`;
}

// Hour labels in a narrow extra-zone column: "3 PM", "3:30" (meridiem dropped when the
// zone is off by a fraction of an hour), or "15:30".
export function formatZoneHour(hours: number, minutes: number) {
  if (!hour12) return `${pad(hours)}:${pad(minutes)}`;
  const h = hours % 12 || 12;
  return minutes === 0 ? `${h} ${meridiem(hours)}` : `${h}:${pad(minutes)}`;
}

function clock(hours: number, minutes: number, withMeridiem: boolean) {
  if (!hour12) return `${pad(hours)}:${pad(minutes)}`;
  const h = hours % 12 || 12;
  const text = minutes === 0 ? `${h}` : `${h}:${pad(minutes)}`;
  return withMeridiem ? `${text} ${meridiem(hours)}` : text;
}

// "9:30 AM" / "9:30". The now pill uses `short` for "10:40" without a suffix.
export const formatTime = (date: Date, short = false) =>
  clock(date.getHours(), date.getMinutes(), !short);

// The same for a time already split into minutes after midnight (in any zone).
export const formatMinutes = (minutes: number, short = false) =>
  clock(Math.floor(minutes / 60) % 24, minutes % 60, !short);

// "9:30–10:15 AM", or "11:30 AM–1 PM" when the range crosses noon.
export function formatRange(start: Date, end: Date) {
  const crosses = hour12 && meridiem(start.getHours()) !== meridiem(end.getHours());
  return `${clock(start.getHours(), start.getMinutes(), crosses)}–${clock(end.getHours(), end.getMinutes(), true)}`;
}

// The range for two times given as minutes after midnight in the grid's zone.
export function formatMinuteRange(start: number, end: number) {
  const startHours = Math.floor(start / 60) % 24;
  const endHours = Math.floor(end / 60) % 24;
  const crosses = hour12 && meridiem(startHours) !== meridiem(endHours);
  return `${clock(startHours, start % 60, crosses)}–${clock(endHours, end % 60, true)}`;
}

// "45m", "1h", "1h30".
export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h${pad(rest)}`;
}

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const monthShort = new Intl.DateTimeFormat(undefined, { month: "short" });
const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const weekdayMonthDay = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export const formatWeekday = (day: DayKey, long = false) =>
  (long ? weekdayLong : weekdayShort).format(fromDayKey(day));

export const formatMonthYear = (day: DayKey) => monthYear.format(fromDayKey(day));

// The toolbar title for a span: "October 2026" or "Oct – Nov 2026".
export function formatSpan(first: DayKey, last: DayKey) {
  if (first.slice(0, 7) === last.slice(0, 7)) return formatMonthYear(first);
  const a = fromDayKey(first);
  const b = fromDayKey(last);
  if (a.getFullYear() === b.getFullYear()) {
    return `${monthShort.format(a)} – ${monthShort.format(b)} ${b.getFullYear()}`;
  }
  return `${monthShort.format(a)} ${a.getFullYear()} – ${monthShort.format(b)} ${b.getFullYear()}`;
}

export const formatMonthDay = (day: DayKey) => monthDay.format(fromDayKey(day));

// Relative wording for deadlines and When: "Today", "Tomorrow", "Fri", "Nov 13".
export function formatRelativeDay(day: DayKey, today: DayKey) {
  const diff = Math.round((fromDayKey(day).getTime() - fromDayKey(today).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return formatWeekday(day);
  if (diff < -1 && diff > -7) return `${formatWeekday(day)}`;
  return day.slice(0, 4) === today.slice(0, 4)
    ? formatMonthDay(day)
    : weekdayMonthDay.format(fromDayKey(day));
}

export const dayNumber = (day: DayKey) => Number(day.slice(8, 10));

/**
 * The week number of `day`: ISO 8601 when weeks start on Monday (week 1 holds the first
 * Thursday), otherwise the simple count where week 1 holds January 1st, as US calendars
 * do for Sunday-first weeks.
 */
export function weekNumber(day: DayKey, weekStart: number) {
  const date = fromDayKey(day);
  if (weekStart === 1) {
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const weekday = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
    const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1);
    return Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7);
  }
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const offset = (jan1.getDay() - weekStart + 7) % 7;
  const dayOfYear = Math.round((date.getTime() - jan1.getTime()) / 86_400_000);
  return Math.floor((dayOfYear + offset) / 7) + 1;
}
