import { type DayKey, fromDayKey, localTimeZone, toDayKey } from "@cal/domain";

/*
 * Time-zone math for the grid. The grid renders in one "primary" zone (the Mac's, a
 * fixed one from Settings, or a temporary travel zone), so every conversion between an
 * instant and a wall-clock day and minute takes the zone. The device zone takes the
 * fast path through `Date`, which keeps today's behavior and exact test results.
 */

export const deviceZone = localTimeZone();

const formatters = new Map<string, Intl.DateTimeFormat>();

// A formatter giving the numeric wall clock of `zone`, cached per zone.
function partsFormatter(zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// The wall clock of `date` in `zone`.
function wallClock(date: Date, zone: string): WallClock {
  const clock: WallClock = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of partsFormatter(zone).formatToParts(date)) {
    if (part.type in clock) clock[part.type as keyof WallClock] = Number(part.value);
  }
  return clock;
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

// Minutes east of UTC that `zone` keeps at `date` (+330 for India, −420 for PDT).
export function zoneOffset(zone: string, date: Date) {
  const clock = wallClock(date, zone);
  const asUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

export const isDeviceZone = (zone: string) => zone === deviceZone;

// The day of `date` in `zone`.
export function zonedDayKey(date: Date, zone: string): DayKey {
  if (isDeviceZone(zone)) return toDayKey(date);
  const clock = wallClock(date, zone);
  return `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}`;
}

// Minutes after midnight of `date` in `zone`.
export function zonedMinutes(date: Date, zone: string) {
  if (isDeviceZone(zone)) return date.getHours() * 60 + date.getMinutes();
  const clock = wallClock(date, zone);
  return clock.hour * 60 + clock.minute;
}

/**
 * The instant at `minutes` after midnight on `day` in `zone`. `minutes` may run past the
 * day in either direction. Two passes resolve the offset, so a time on a DST day lands
 * on the right side of the change; a time in a skipped hour moves forward.
 */
export function zonedInstant(day: DayKey, minutes: number, zone: string) {
  if (isDeviceZone(zone)) {
    const date = fromDayKey(day);
    date.setMinutes(minutes);
    return date;
  }
  const [year = 1970, month = 1, date = 1] = day.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, date, 0, minutes);
  const guess = new Date(wall - zoneOffset(zone, new Date(wall)) * 60_000);
  return new Date(wall - zoneOffset(zone, guess) * 60_000);
}

// "PDT", "GMT+5:30", "IST": the zone's short name at `date` in the user's language.
export function zoneAbbreviation(zone: string, date: Date) {
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    timeZoneName: "short",
  }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? zone;
}

// "GMT+5:30" / "GMT-7" for the zone's offset at `date`.
export function offsetLabel(zone: string, date: Date) {
  const offset = zoneOffset(zone, date);
  if (offset === 0) return "GMT";
  const sign = offset > 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `GMT${sign}${hours}${minutes ? `:${pad(minutes)}` : ""}`;
}

// The city part of an IANA name: "America/Los_Angeles" → "Los Angeles".
export function zoneCity(zone: string) {
  const city = zone.split("/").pop() ?? zone;
  return city.replace(/_/g, " ");
}

/**
 * Days among `days` whose offset between `zone` and `primary` differs from the offset on
 * `reference`, so a column can flag a DST change inside the visible range. Returns the
 * first such day with the change in hours (+1 when the zone moves ahead).
 */
export function dstShift(
  zone: string,
  primary: string,
  reference: DayKey,
  days: readonly DayKey[],
) {
  const at = (day: DayKey) => {
    const noon = zonedInstant(day, 12 * 60, primary);
    return zoneOffset(zone, noon) - zoneOffset(primary, noon);
  };
  const base = at(reference);
  for (const day of days) {
    const delta = at(day) - base;
    if (delta !== 0) return { day, hours: delta / 60 };
  }
  return null;
}

/*
 * The zone picker's catalogue: every IANA zone Chromium knows, searchable by city,
 * region, abbreviation, common country names and "UTC±n". Search ignores accents and
 * case. Recent and common zones come first when nothing is typed.
 */

export interface ZoneEntry {
  zone: string;
  // "Los Angeles", "Kolkata".
  city: string;
  // Extra words this entry answers to: countries, abbreviations, old names.
  aliases: readonly string[];
}

// Common names people type that the IANA name doesn't contain.
const ALIASES: Record<string, readonly string[]> = {
  "America/Los_Angeles": ["LA", "San Francisco", "Seattle", "Pacific", "PST", "PDT", "California"],
  "America/Denver": ["Mountain", "MST", "MDT"],
  "America/Phoenix": ["Arizona"],
  "America/Chicago": ["Central", "CST", "CDT", "Austin", "Dallas", "Houston"],
  "America/New_York": ["NYC", "Eastern", "EST", "EDT", "Boston", "Miami", "Washington"],
  "America/Toronto": ["Canada", "Montreal", "Montréal"],
  "America/Vancouver": ["Canada"],
  "America/Mexico_City": ["Mexico", "CDMX"],
  "America/Sao_Paulo": ["Brazil", "Brasil", "São Paulo", "BRT"],
  "America/Argentina/Buenos_Aires": ["Argentina"],
  "America/Bogota": ["Colombia", "Bogotá"],
  "America/Lima": ["Peru"],
  "America/Santiago": ["Chile"],
  "Europe/London": ["UK", "United Kingdom", "England", "Britain", "GMT", "BST"],
  "Europe/Dublin": ["Ireland"],
  "Europe/Lisbon": ["Portugal", "WET"],
  "Europe/Paris": ["France", "CET", "CEST"],
  "Europe/Berlin": ["Germany", "Deutschland", "CET", "CEST", "Munich", "Hamburg"],
  "Europe/Madrid": ["Spain", "España", "Barcelona"],
  "Europe/Rome": ["Italy", "Italia", "Milan"],
  "Europe/Amsterdam": ["Netherlands", "Holland"],
  "Europe/Brussels": ["Belgium"],
  "Europe/Zurich": ["Switzerland", "Schweiz", "Geneva", "Zürich"],
  "Europe/Vienna": ["Austria"],
  "Europe/Stockholm": ["Sweden", "Sverige"],
  "Europe/Oslo": ["Norway"],
  "Europe/Copenhagen": ["Denmark"],
  "Europe/Helsinki": ["Finland", "EET"],
  "Europe/Warsaw": ["Poland"],
  "Europe/Prague": ["Czechia", "Czech"],
  "Europe/Athens": ["Greece"],
  "Europe/Istanbul": ["Turkey", "Türkiye"],
  "Europe/Kyiv": ["Ukraine", "Kiev"],
  "Europe/Moscow": ["Russia", "MSK"],
  "Africa/Cairo": ["Egypt"],
  "Africa/Lagos": ["Nigeria", "WAT"],
  "Africa/Nairobi": ["Kenya", "EAT"],
  "Africa/Johannesburg": ["South Africa", "SAST"],
  "Asia/Dubai": ["UAE", "Emirates", "GST"],
  "Asia/Riyadh": ["Saudi Arabia"],
  "Asia/Tel_Aviv": ["Israel"],
  "Asia/Karachi": ["Pakistan", "PKT"],
  "Asia/Kolkata": ["India", "IST", "Mumbai", "Delhi", "Bangalore", "Bengaluru", "Calcutta"],
  "Asia/Dhaka": ["Bangladesh"],
  "Asia/Bangkok": ["Thailand", "ICT"],
  "Asia/Jakarta": ["Indonesia", "WIB"],
  "Asia/Singapore": ["SGT"],
  "Asia/Kuala_Lumpur": ["Malaysia"],
  "Asia/Manila": ["Philippines", "PHT"],
  "Asia/Hong_Kong": ["HKT"],
  "Asia/Shanghai": ["China", "Beijing", "CST"],
  "Asia/Taipei": ["Taiwan"],
  "Asia/Seoul": ["Korea", "KST"],
  "Asia/Tokyo": ["Japan", "JST", "Osaka"],
  "Australia/Sydney": ["AEST", "AEDT", "Melbourne", "Canberra"],
  "Australia/Brisbane": ["Queensland"],
  "Australia/Perth": ["AWST"],
  "Australia/Adelaide": ["ACST"],
  "Pacific/Auckland": ["New Zealand", "NZST", "NZDT", "Wellington"],
  "Pacific/Honolulu": ["Hawaii", "HST"],
  "America/Anchorage": ["Alaska", "AKST"],
  UTC: ["Universal", "Zulu", "GMT"],
};

// Zones offered before any search: the ones most people add.
export const COMMON_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const supportedZones = (() => {
  const zones = new Set(Intl.supportedValuesOf("timeZone"));
  for (const zone of Object.keys(ALIASES)) zones.add(zone);
  return [...zones];
})();

export const ZONES: readonly ZoneEntry[] = supportedZones.map((zone) => ({
  zone,
  city: zoneCity(zone),
  aliases: [...(ALIASES[zone] ?? []), ...zone.split("/").slice(0, -1)],
}));

export const isKnownZone = (zone: string) => supportedZones.includes(zone);

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Zones matching `query`: every word must start a word of the city, the IANA name, or an
 * alias. "utc+5:30" / "gmt-7" match by offset at `now`. With an empty query, `recent`
 * come first, then the common ones.
 */
export function searchZones(query: string, recent: readonly string[], now: Date) {
  const text = fold(query.trim());
  if (!text) {
    const order = [...new Set([...recent, ...COMMON_ZONES])];
    return order.flatMap((zone) => ZONES.filter((entry) => entry.zone === zone));
  }
  const offset = /^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/.exec(text);
  if (offset) {
    const sign = offset[1] === "-" ? -1 : 1;
    const minutes = sign * (Number(offset[2]) * 60 + Number(offset[3] ?? 0));
    return ZONES.filter((entry) => zoneOffset(entry.zone, now) === minutes);
  }
  const words = text.split(/\s+/);
  const scored = ZONES.flatMap((entry) => {
    const haystack = [entry.city, entry.zone.replace(/[_/]/g, " "), ...entry.aliases]
      .map(fold)
      .join(" ");
    const starts = haystack.split(/[\s/]+/);
    if (!words.every((word) => starts.some((start) => start.startsWith(word)))) return [];
    const city = fold(entry.city);
    const score = city.startsWith(text) ? 0 : city.includes(text) ? 1 : 2;
    return [{ entry, score }];
  });
  return scored.sort((a, b) => a.score - b.score).map(({ entry }) => entry);
}
