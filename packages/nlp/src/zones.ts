import { offsetMinutes, toOffsetIso, wallParts } from "@cal/domain";

/*
 * Time zones named in text. Abbreviations stand for a zone's family (PST, PDT and PT
 * all mean Los Angeles time), so "3pm PST" in summer is 3 PM Los Angeles time, not a
 * fixed -08:00. The wall-clock math itself lives in @cal/domain.
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
