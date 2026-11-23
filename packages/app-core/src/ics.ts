import type { EventInput } from "@cal/calendar-source";
import {
  addDays,
  fromDayKey,
  isDayKey,
  localTimeZone,
  meetingFromUrl,
  toOffsetIso,
  zonedInstant,
} from "@cal/domain";

/*
 * Reads the events of an .ics file (RFC 5545) into what a calendar can create. Only what
 * an EventInput holds is read: a series' changed or removed dates can't be written to a
 * device calendar, so they are counted rather than guessed at.
 */

export type IcsEvent = Omit<EventInput, "calendarId">;

export interface IcsFile {
  events: IcsEvent[];
  // Changed or left-out dates of a repeating event, which were not brought over.
  exceptions: number;
  // Canceled events and ones without a readable date.
  skipped: number;
}

interface Property {
  name: string;
  params: Map<string, string>;
  value: string;
}

// One event, whatever the file's size.
const MAX_EVENTS = 2000;

// Outlook names zones its own way; these are the common ones. Others read as this device's.
const WINDOWS_ZONES: Record<string, string> = {
  "dateline standard time": "Etc/GMT+12",
  "hawaiian standard time": "Pacific/Honolulu",
  "alaskan standard time": "America/Anchorage",
  "pacific standard time": "America/Los_Angeles",
  "us mountain standard time": "America/Phoenix",
  "mountain standard time": "America/Denver",
  "central standard time": "America/Chicago",
  "eastern standard time": "America/New_York",
  "atlantic standard time": "America/Halifax",
  "e. south america standard time": "America/Sao_Paulo",
  "gmt standard time": "Europe/London",
  "greenwich standard time": "Atlantic/Reykjavik",
  "w. europe standard time": "Europe/Berlin",
  "romance standard time": "Europe/Paris",
  "central europe standard time": "Europe/Budapest",
  "central european standard time": "Europe/Warsaw",
  "e. europe standard time": "Europe/Chisinau",
  "fle standard time": "Europe/Kiev",
  "gtb standard time": "Europe/Bucharest",
  "israel standard time": "Asia/Jerusalem",
  "south africa standard time": "Africa/Johannesburg",
  "russian standard time": "Europe/Moscow",
  "arabian standard time": "Asia/Dubai",
  "pakistan standard time": "Asia/Karachi",
  "india standard time": "Asia/Kolkata",
  "bangladesh standard time": "Asia/Dhaka",
  "se asia standard time": "Asia/Bangkok",
  "china standard time": "Asia/Shanghai",
  "singapore standard time": "Asia/Singapore",
  "tokyo standard time": "Asia/Tokyo",
  "korea standard time": "Asia/Seoul",
  "aus eastern standard time": "Australia/Sydney",
  "new zealand standard time": "Pacific/Auckland",
  utc: "UTC",
};

// The IANA zone a TZID names. Some apps prefix theirs with a path ("/example.org/…").
function zoneOf(tzid: string | undefined) {
  if (!tzid) return undefined;
  const windows = WINDOWS_ZONES[tzid.toLowerCase()];
  for (const name of [windows, tzid, tzid.split("/").slice(-2).join("/")]) {
    if (!name) continue;
    try {
      return (
        new Intl.DateTimeFormat("en-US", { timeZone: name }).resolvedOptions().timeZone && name
      );
    } catch {
      // Not a zone this runtime knows; try the next reading.
    }
  }
  return undefined;
}

// Splits "NAME;PARAM=value;PARAM="quoted:value":VALUE". Colons inside quotes don't count.
function parseLine(line: string): Property | undefined {
  const match =
    /^([\w-]+)((?:;[\w-]+=(?:"[^"]*"|[^";:,]*)(?:,(?:"[^"]*"|[^";:,]*))*)*):(.*)$/s.exec(line);
  if (!match) return undefined;
  const [, name = "", params = "", value = ""] = match;
  return {
    name: name.toUpperCase(),
    params: new Map(
      [...params.matchAll(/;([\w-]+)=("[^"]*"|[^;]*)/g)].map(([, key = "", raw = ""]) => [
        key.toUpperCase(),
        raw.replace(/^"|"$/g, ""),
      ]),
    ),
    value,
  };
}

const unescaped = (text: string) =>
  text.replace(/\\(.)/gs, (_, char: string) => (char.toLowerCase() === "n" ? "\n" : char));

// "P1DT2H30M", "-PT15M", "P2W" in minutes.
function durationMinutes(text: string) {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    text,
  );
  if (!match) return undefined;
  const [, sign, ...parts] = match;
  const [weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = parts.map((part) =>
    Number(part ?? 0),
  );
  const total = ((weeks * 7 + days) * 24 + hours) * 60 + minutes + Math.round(seconds / 60);
  return sign === "-" ? -total : total;
}

// A DTSTART or DTEND: a day, or an instant with the zone it was written in.
function parseWhen({ value, params }: Property) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, date, hour, minute, , utc] = match;
  const day = `${year}-${month}-${date}`;
  if (!isDayKey(day)) return undefined;
  if (hour === undefined) return { day, allDay: true as const };
  const zone = utc ? "UTC" : (zoneOf(params.get("TZID")) ?? localTimeZone());
  const at = new Date(zonedInstant(day, Number(hour) * 60 + Number(minute), zone));
  // A UTC stamp says nothing about where the event is; it's pinned to no zone.
  return { at, allDay: false as const, zone: utc ? undefined : zone };
}

const DEFAULT_MINUTES = 30;

function readEvent(properties: readonly Property[], alarms: readonly number[]) {
  const get = (name: string) => properties.find((property) => property.name === name);
  const text = (name: string) => unescaped(get(name)?.value ?? "").trim() || undefined;
  const start = get("DTSTART");
  const from = start && parseWhen(start);
  if (!from) return undefined;
  const dtend = get("DTEND");
  const to = dtend && parseWhen(dtend);
  const length = durationMinutes(get("DURATION")?.value.trim() ?? "");
  const calls = [get("X-GOOGLE-CONFERENCE")?.value, get("X-MICROSOFT-SKYPETEAMSMEETINGURL")?.value];
  const event = {
    title: text("SUMMARY") ?? "Untitled event",
    location: text("LOCATION"),
    notes: text("DESCRIPTION"),
    url: text("URL") ?? calls.find((url) => url && meetingFromUrl(url)),
    recurrence: get("RRULE")?.value.trim().toUpperCase() || undefined,
    busy: get("TRANSP")?.value.trim().toUpperCase() !== "TRANSPARENT",
  };
  if (from.allDay) {
    const days = length !== undefined ? Math.max(1, Math.round(length / (24 * 60))) : 1;
    // The end is exclusive; one that isn't after the start means a single day.
    const last = to?.allDay && to.day > from.day ? to.day : addDays(from.day, days);
    return {
      ...event,
      allDay: true,
      start: toOffsetIso(fromDayKey(from.day)),
      end: toOffsetIso(fromDayKey(last)),
      // All-day events are free unless the file says otherwise, as calendars make them.
      busy: get("TRANSP")?.value.trim().toUpperCase() === "OPAQUE",
    };
  }
  const startMs = from.at.getTime();
  const endMs = to && !to.allDay ? to.at.getTime() : startMs + (length ?? DEFAULT_MINUTES) * 60_000;
  return {
    ...event,
    allDay: false,
    start: toOffsetIso(from.at),
    end: toOffsetIso(new Date(Math.max(startMs, endMs))),
    ...(from.zone && { timeZone: from.zone }),
    ...(alarms.length > 0 && { alarms: [...new Set(alarms)].sort((a, b) => a - b) }),
  };
}

/** The events in an .ics file's text. Text that isn't one has no events. */
export function parseIcs(text: string): IcsFile {
  const file: IcsFile = { events: [], exceptions: 0, skipped: 0 };
  // Long lines are folded onto continuation lines that start with a space or tab.
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const open: string[] = [];
  let canceled = false;
  let properties: Property[] = [];
  let alarms: number[] = [];
  for (const line of lines) {
    const property = parseLine(line);
    if (!property) continue;
    const value = property.value.trim().toUpperCase();
    if (property.name === "BEGIN") {
      open.push(value);
      if (value === "VEVENT") {
        properties = [];
        alarms = [];
      }
      continue;
    }
    if (property.name === "END") {
      open.pop();
      if (value !== "VEVENT") continue;
      const has = (name: string) => properties.some((each) => each.name === name);
      if (has("RECURRENCE-ID")) file.exceptions++;
      else if (
        canceled ||
        properties.some(
          (each) => each.name === "STATUS" && each.value.trim().toUpperCase() === "CANCELLED",
        )
      )
        file.skipped++;
      else {
        const event = readEvent(properties, alarms);
        if (!event || file.events.length >= MAX_EVENTS) file.skipped++;
        else {
          file.events.push(event);
          if (has("EXDATE") || has("RDATE")) file.exceptions++;
        }
      }
      continue;
    }
    const inside = open.at(-1);
    if (inside === "VCALENDAR" && property.name === "METHOD") canceled = value === "CANCEL";
    else if (inside === "VEVENT") properties.push(property);
    else if (
      inside === "VALARM" &&
      property.name === "TRIGGER" &&
      property.params.get("RELATED")?.toUpperCase() !== "END"
    ) {
      const minutes = durationMinutes(value);
      if (minutes !== undefined && minutes <= 0) alarms.push(-minutes);
    }
  }
  return file;
}
