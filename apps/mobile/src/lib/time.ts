import { type DayKey, fromDayKey } from "@cal/domain";

/*
 * Time and date text. Hour labels are compact ("9 AM"), chip ranges use an en dash with
 * no spaces and show AM/PM once ("9:30–10:15 AM"), and durations read "1h30".
 */

const hour12 =
  new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ?? true;

const pad = (value: number) => String(value).padStart(2, "0");

const meridiem = (hours: number) => (hours < 12 ? "AM" : "PM");

// "9 AM", "12 PM", or "09:00" with a 24-hour clock.
export function formatHour(hour: number) {
  if (!hour12) return `${pad(hour)}:00`;
  const h = hour % 12 || 12;
  return `${h} ${meridiem(hour)}`;
}

function clock(date: Date, withMeridiem: boolean) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  if (!hour12) return `${pad(hours)}:${pad(minutes)}`;
  const h = hours % 12 || 12;
  const text = minutes === 0 ? `${h}` : `${h}:${pad(minutes)}`;
  return withMeridiem ? `${text} ${meridiem(hours)}` : text;
}

// "9:30 AM" / "9:30". The now pill uses `short` for "10:40" without a suffix.
export const formatTime = (date: Date, short = false) => clock(date, !short);

// "9:30–10:15 AM", or "11:30 AM–1 PM" when the range crosses noon.
export function formatRange(start: Date, end: Date) {
  const crosses = hour12 && meridiem(start.getHours()) !== meridiem(end.getHours());
  return `${clock(start, crosses)}–${clock(end, true)}`;
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
