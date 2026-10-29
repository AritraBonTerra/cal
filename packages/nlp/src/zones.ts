import { type DayKey, toOffsetIso } from "@cal/domain";

/*
 * Time zones named in text. Abbreviations stand for a zone's family (PST, PDT and PT
 * all mean Los Angeles time), so "3pm PST" in summer is 3 PM Los Angeles time, not a
 * fixed -08:00. Offsets come from Intl, which works in Node, Chromium and Hermes.
 */

export const ZONE_ABBREVIATIONS: Record<string, string> = {
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  PT: "America/Los_Angeles",
  MST: "America/Denver",
  MDT: "America/Denver",
  MT: "America/Denver",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  CT: "America/Chicago",
  EST: "America/New_York",
  EDT: "America/New_York",
  ET: "America/New_York",
  GMT: "GMT",
  UTC: "UTC",
  BST: "Europe/London",
  CET: "Europe/Paris",
  CEST: "Europe/Paris",
  IST: "Asia/Kolkata",
  JST: "Asia/Tokyo",
  AEST: "Australia/Sydney",
};

const formatters = new Map<string, Intl.DateTimeFormat>();

// Wall-clock parts of the instant `ms` in `zone`.
function wallParts(ms: number, zone: string) {
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

// The instant of wall-clock `day` at `minutes` past midnight in `zone`.
export function zonedInstant(day: DayKey, minutes: number, zone: string) {
  const [year = 1970, month = 1, date = 1] = day.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, date, 0, minutes);
  const offset = (ms: number) => offsetMinutes(ms, zone) * 60_000;
  const first = wall - offset(wall);
  const second = wall - offset(first);
  // In a skipped hour neither reading keeps its offset; the later one moves forward.
  return offset(second) === offset(first) ? second : Math.max(first, second);
}

const pad = (value: number) => String(value).padStart(2, "0");

// `ms` as ISO 8601 with the offset of `zone`, or of the device when no zone is given.
export function isoIn(ms: number, zone?: string) {
  if (!zone) return toOffsetIso(new Date(ms));
  const p = wallParts(ms, zone);
  const offset = offsetMinutes(ms, zone);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * A Date whose device-local fields read as the wall clock of `zone` at the instant `ms`.
 * The parser works in device-local dates (chrono does), so parsing "in another zone"
 * means parsing against this shifted clock and converting results with zonedInstant.
 */
export function wallDate(ms: number, zone: string) {
  const p = wallParts(ms, zone);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
