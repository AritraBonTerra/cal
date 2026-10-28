import { ZONE_ABBREVIATIONS } from "./zones";

/*
 * Times and time ranges, read by Cal rather than chrono (chrono reads "at 5" as 5 AM,
 * misses "9-11:30", and treats "PST" as a fixed offset). A bare number only counts as a
 * time with a lead word ("at 5", "from 3 to 4:30") or next to a time that has a
 * meridiem or minutes, so "Room 101" and "chapter 3" stay text.
 */

export interface TimeMatch {
  start: number;
  end: number;
  // Minutes after midnight; endMin is set for ranges.
  startMin: number;
  endMin?: number;
  zone?: string;
  endZone?: string;
  // Whether am/pm was inferred rather than typed.
  inferred: boolean;
}

const ZONE = `(?:\\s*(${Object.keys(ZONE_ABBREVIATIONS).join("|")})\\b)?`;
const MERIDIEM = "(a\\.m\\.|p\\.m\\.|am|pm|a|p)";
// hour[:minutes][am|pm], or noon / midnight.
const CLOCK = `(noon|midnight|(\\d{1,2})(?::(\\d{2}))?\\s*${MERIDIEM}?)`;

const RANGE = new RegExp(
  `(?<![\\w:/])(?:(from|at|between)\\s+)?${CLOCK}${ZONE}\\s*(?:-|to|until|till|and)\\s*${CLOCK}${ZONE}(?![\\w:])`,
  "gi",
);
const SINGLE = new RegExp(`(?<![\\w:/.])(?:(at|@|by)\\s+)?${CLOCK}${ZONE}(?![\\w:/])`, "gi");

interface Clock {
  hour: number;
  minute: number;
  meridiem?: "am" | "pm";
  // Typed with minutes or a meridiem, or as noon/midnight: clearly a time.
  strong: boolean;
}

// One clock from its regex groups: [word, hour, minute, meridiem].
function readClock(
  word?: string,
  hour?: string,
  minute?: string,
  meridiem?: string,
): Clock | undefined {
  const lower = word?.toLowerCase();
  if (lower === "noon") return { hour: 12, minute: 0, meridiem: "pm", strong: true };
  if (lower === "midnight") return { hour: 0, minute: 0, meridiem: "am", strong: true };
  if (hour === undefined) return undefined;
  const h = Number(hour);
  const m = minute === undefined ? 0 : Number(minute);
  if (h > 23 || m > 59) return undefined;
  const mer = meridiem?.toLowerCase().startsWith("p")
    ? "pm"
    : meridiem?.toLowerCase().startsWith("a")
      ? "am"
      : undefined;
  if (mer && (h === 0 || h > 12)) return undefined;
  return { hour: h, minute: m, meridiem: mer, strong: mer !== undefined || minute !== undefined };
}

// Minutes after midnight for a clock with a known meridiem (or 24-hour time).
function toMinutes(clock: Clock, meridiem: "am" | "pm" | undefined) {
  let hour = clock.hour;
  if (hour <= 12 && meridiem === "pm" && hour !== 12) hour += 12;
  if (hour === 12 && meridiem === "am") hour = 0;
  return hour * 60 + clock.minute;
}

/*
 * Cal's am/pm rule for a time typed without one (research/10 §2.1): a context word wins
 * (morning → am; afternoon/evening/tonight → pm), then dinner-ish titles lean pm, then
 * 1–6 → pm, 7–11 → am, 12 → noon. 24-hour times (13:00) need no guess.
 */
export function inferMeridiem(clock: Clock, text: string): "am" | "pm" | undefined {
  if (clock.meridiem) return clock.meridiem;
  if (clock.hour === 0 || clock.hour > 12) return undefined;
  if (/\bmorning\b/i.test(text)) return "am";
  if (/\b(afternoon|evening|tonight)\b/i.test(text)) return "pm";
  if (/\b(dinner|supper|drinks)\b/i.test(text)) return "pm";
  if (clock.hour === 12) return "pm";
  return clock.hour <= 6 ? "pm" : "am";
}

const zoneOf = (abbreviation?: string) =>
  abbreviation ? ZONE_ABBREVIATIONS[abbreviation.toUpperCase()] : undefined;

/**
 * Every time and time range in `masked`, ranges first. `context` is the whole input,
 * used for meridiem words ("morning", "dinner").
 */
export function findTimes(masked: string, context: string): TimeMatch[] {
  const found: TimeMatch[] = [];
  const taken: [number, number][] = [];
  const free = (start: number, end: number) => !taken.some(([s, e]) => start < e && end > s);

  RANGE.lastIndex = 0;
  for (let m = RANGE.exec(masked); m; m = RANGE.exec(masked)) {
    const lead = m[1]?.toLowerCase();
    const a = readClock(m[2], m[3], m[4], m[5]);
    const b = readClock(m[7], m[8], m[9], m[10]);
    // "and" only joins times after "between"; bare ranges need one clearly-a-time end.
    const joiner = m[0].slice(m[0].indexOf(m[2] ?? ""));
    if (!a || !b) continue;
    if (/\sand\s/i.test(joiner) && lead !== "between") continue;
    if (!lead && !a.strong && !b.strong) continue;
    // A meridiem typed on one end carries to the other when that keeps start before end.
    let am = a.meridiem;
    let bm = b.meridiem;
    let inferred = false;
    if (!am && bm) {
      am = toMinutes(a, bm) < toMinutes(b, bm) ? bm : bm === "pm" ? "am" : "pm";
      if (a.hour > 12) am = undefined;
    }
    if (!am) {
      am = inferMeridiem(a, context);
      inferred = am !== undefined;
    }
    if (!bm) {
      const startMin = toMinutes(a, am);
      const asAm = toMinutes(b, "am");
      const asPm = toMinutes(b, "pm");
      bm = b.hour > 12 ? undefined : asAm > startMin ? "am" : asPm > startMin ? "pm" : "am";
      inferred ||= bm !== undefined && !b.meridiem && b.hour <= 12;
    }
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      startMin: toMinutes(a, am),
      endMin: toMinutes(b, bm),
      zone: zoneOf(m[6]),
      endZone: zoneOf(m[11]) ?? zoneOf(m[6]),
      inferred,
    });
    taken.push([m.index, m.index + m[0].length]);
  }

  SINGLE.lastIndex = 0;
  for (let m = SINGLE.exec(masked); m; m = SINGLE.exec(masked)) {
    const lead = m[1]?.toLowerCase();
    const clock = readClock(m[2], m[3], m[4], m[5]);
    if (!clock || !free(m.index, m.index + m[0].length)) continue;
    if (!lead && !clock.strong) continue;
    if (lead === "by" && !clock.strong) continue;
    const meridiem = inferMeridiem(clock, context);
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      startMin: toMinutes(clock, meridiem),
      zone: zoneOf(m[6]),
      inferred: !clock.meridiem && clock.hour > 0 && clock.hour <= 12,
    });
  }
  return found.sort((a, b) => a.start - b.start);
}

// "9:30 AM" / "13:00"-style label for minutes after midnight.
export function clockLabel(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`;
}
