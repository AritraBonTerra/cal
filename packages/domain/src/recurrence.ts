import { addDays, atMinute, type DayKey, daysInMonth, fromDayKey, toDayKey } from "./dates";

/*
 * Just enough RRULE (RFC 5545 bodies without the "RRULE:" prefix) to expand a series:
 * FREQ with INTERVAL, BYDAY (with ordinals like "1FR" / "-1FR" for monthly rules),
 * BYMONTHDAY (incl. -1), COUNT and UNTIL — every rule Cal writes. Fixture calendars
 * store a series as one row per occurrence, and undoing a delete needs an occurrence's
 * place in its series. BYMONTH, BYSETPOS and the like are ignored.
 */

export interface Occurrence {
  start: Date;
  end: Date;
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// A rule's parts by name, e.g. { FREQ: "WEEKLY", BYDAY: "MO,WE" }.
export const ruleParts = (rule: string) =>
  new Map(rule.split(";").map((part) => part.split("=") as [string, string]));

/** A rule's COUNT; undefined when it ends by UNTIL or never. */
export function ruleCount(rule: string) {
  const count = ruleParts(rule).get("COUNT");
  return count === undefined ? undefined : Number(count);
}

/** `rule` with its COUNT set to `count`, in place of the old one. */
export function withCount(rule: string, count: number) {
  const parts = rule.split(";").filter((part) => !part.startsWith("COUNT="));
  return [...parts, `COUNT=${count}`].join(";");
}

/**
 * The occurrences of `rule` for an event running `start`–`end`, scanning `days` days
 * from the start. Each keeps the start's wall-clock time in the device's zone, so a
 * 9:30 standup stays at 9:30 across a DST change.
 */
export function expandRule(rule: string, start: Date, end: Date, days = 90): Occurrence[] {
  const parts = ruleParts(rule);
  const freq = parts.get("FREQ") ?? "DAILY";
  const interval = Number(parts.get("INTERVAL") ?? 1);
  const count = Number(parts.get("COUNT") ?? Number.POSITIVE_INFINITY);
  const untilText = parts.get("UNTIL");
  const until = untilText ? untilInstant(untilText) : undefined;
  const byDay = parts.get("BYDAY")?.split(",") ?? [WEEKDAYS[start.getDay()] ?? "MO"];
  const first = toDayKey(start);
  const length = end.getTime() - start.getTime();
  const minutes = start.getHours() * 60 + start.getMinutes();
  const result: Occurrence[] = [];
  for (let offset = 0; offset < days && result.length < count; offset++) {
    const key = addDays(first, offset);
    const months =
      (Number(key.slice(0, 4)) - Number(first.slice(0, 4))) * 12 +
      Number(key.slice(5, 7)) -
      Number(first.slice(5, 7));
    const due =
      freq === "DAILY"
        ? offset % interval === 0
        : freq === "WEEKLY"
          ? Math.floor((offset + start.getDay()) / 7) % interval === 0 &&
            byDay.includes(WEEKDAYS[fromDayKey(key).getDay()] ?? "")
          : freq === "MONTHLY"
            ? months % interval === 0 && monthlyDay(parts, key, first)
            : months % (12 * interval) === 0 && key.slice(5) === first.slice(5);
    if (!due) continue;
    const occurrence = atMinute(key, minutes);
    if (until !== undefined && occurrence.getTime() > until) break;
    result.push({ start: occurrence, end: new Date(occurrence.getTime() + length) });
  }
  return result;
}

// Whether `key` is a day a monthly rule falls on: its BYMONTHDAY, its BYDAY with an
// ordinal ("1FR" first Friday, "-1FR" last), or the start's day of the month.
function monthlyDay(parts: Map<string, string>, key: DayKey, first: DayKey) {
  const date = Number(key.slice(8));
  const length = daysInMonth(key);
  const monthDay = parts.get("BYMONTHDAY");
  if (monthDay !== undefined) {
    return monthDay.split(",").some((n) => {
      const value = Number(n);
      return value > 0 ? date === value : date === length + value + 1;
    });
  }
  const byDay = parts.get("BYDAY");
  if (byDay !== undefined) {
    const weekday = WEEKDAYS[fromDayKey(key).getDay()];
    return byDay.split(",").some((entry) => {
      const match = /^([+-]?\d)?(\w\w)$/.exec(entry);
      if (!match || match[2] !== weekday) return false;
      const nth = Number(match[1] ?? 0);
      if (nth === 0) return true;
      return nth > 0 ? Math.ceil(date / 7) === nth : Math.ceil((length - date + 1) / 7) === -nth;
    });
  }
  return date === Number(first.slice(8));
}

// The last instant an UNTIL allows: a date form covers its whole local day, a time form
// (YYYYMMDDTHHMMSS, Z for UTC) is exact.
function untilInstant(text: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(text);
  if (!match) return undefined;
  const [, year = "", month = "", day = "", hour, minute, second, utc] = match;
  if (hour === undefined) return atMinute(addDays(`${year}-${month}-${day}`, 1), 0).getTime() - 1;
  const fields = [
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ] as const;
  return utc ? Date.UTC(...fields) : new Date(...fields).getTime();
}
