import { addDays, type DayKey, daysBetween } from "./dates";

/*
 * Wall-clock math in any IANA zone, through Intl (Node, Chromium and Hermes all have
 * it). A time in a fall-back hour, which happens twice, means the first; one in a
 * spring-forward gap, which never happens, moves forward. Foundation's Calendar reads
 * them the same way, so occurrence ids computed here match the ones calkit writes.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

// Wall-clock parts of the instant `ms` in `zone`.
export function wallParts(ms: number, zone: string) {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(ms)).map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: (parts.hour ?? 0) % 24,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

// Minutes `zone` is ahead of UTC at the instant `ms`.
export function offsetMinutes(ms: number, zone: string) {
  const p = wallParts(ms, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

const HOURS_6 = 6 * 60 * 60_000;

// The instant (ms) of wall-clock `day` at `minutes` past midnight in `zone`.
export function zonedInstant(day: DayKey, minutes: number, zone: string) {
  const [year = 1970, month = 1, date = 1] = day.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, date, 0, minutes);
  const offset = (ms: number) => offsetMinutes(ms, zone) * 60_000;
  const guess = wall - offset(wall);
  // The offsets on either side; they differ only near a DST change.
  const readings = [offset(guess - HOURS_6), offset(guess + HOURS_6)].map((each) => wall - each);
  const real = readings.filter((ms) => ms + offset(ms) === wall);
  return real.length > 0 ? Math.min(...real) : Math.max(...readings);
}

// The wall-clock day of `ms` in `zone` and the time of day in ms.
function clockOf(ms: number, zone: string) {
  const p = wallParts(ms, zone);
  const day: DayKey = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const fraction = ((ms % 1000) + 1000) % 1000;
  return { day, time: ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 + fraction };
}

/**
 * `from` → `to` as a move on `zone`'s wall clock: whole days plus the change of clock
 * time. A calendar re-expands a moved series this way, so every occurrence keeps its
 * clock time across a DST change instead of moving by the same number of hours.
 */
export function wallMove(from: Date, to: Date, zone: string) {
  const before = clockOf(from.getTime(), zone);
  const after = clockOf(to.getTime(), zone);
  const days = daysBetween(before.day, after.day);
  const delta = after.time - before.time;
  return (instant: Date) => {
    const clock = clockOf(instant.getTime(), zone);
    const time = clock.time + delta;
    const minutes = Math.floor(time / 60_000);
    return new Date(
      zonedInstant(addDays(clock.day, days), minutes, zone) + (time - minutes * 60_000),
    );
  };
}
