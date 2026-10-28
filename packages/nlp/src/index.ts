import {
  addDays,
  addMonths,
  type DayKey,
  daysBetween,
  fromDayKey,
  localTimeZone,
  startOfMonth,
  startOfWeek,
  toDayKey,
  weekday,
} from "@cal/domain";
import * as chrono from "chrono-node/en";
import { DAY_CODES, dayCode, findRule, type Rule, ruleLabel, toRRule } from "./recurrence";
import { clockLabel, findTimes, type TimeMatch } from "./times";
import type {
  Confidence,
  EventEntry,
  ParseContext,
  QuickEntry,
  TaskEntry,
  Token,
  TokenKind,
} from "./types";
import { isoIn, zonedInstant } from "./zones";

export type * from "./types";

/*
 * Quick Entry: one line of text → an event or a to-do (research/10 §4). Passes run in a
 * fixed order over a masked copy of the input: each pass blanks out what it claims, so
 * later passes can't re-read it and offsets never shift. Then the claimed tokens are
 * assembled, and whatever text is left becomes the title.
 */

const DAY_MS = 86_400_000;

// A working copy of the input that passes claim spans of.
class Scanner {
  masked: string;
  readonly tokens: Token[] = [];
  // Quoted spans: parsed as plain text, quote marks dropped from the title.
  readonly quotes: [number, number][] = [];

  constructor(
    readonly text: string,
    literals: readonly { start: number; end: number }[],
  ) {
    // Same-length substitutions only, so offsets match the original text.
    this.masked = text.replace(/[–—→]/g, "-").replace(/[“”]/g, '"');
    for (const m of this.masked.matchAll(/"([^"]*)"/g)) {
      this.quotes.push([m.index, m.index + m[0].length]);
      this.blank(m.index, m.index + m[0].length);
    }
    for (const { start, end } of literals) this.blank(start, end);
  }

  blank(start: number, end: number) {
    this.masked = this.masked.slice(0, start) + " ".repeat(end - start) + this.masked.slice(end);
  }

  // Records an applied token and blanks its span.
  claim(
    kind: TokenKind,
    start: number,
    end: number,
    label: string,
    confidence: Confidence = "certain",
  ) {
    const token: Token = { kind, start, end, confidence, label, applied: true };
    this.tokens.push(token);
    this.blank(start, end);
    return token;
  }

  // Whether nothing but blanks (claimed or empty) follows `end`.
  isTail(end: number) {
    return this.masked.slice(end).trim() === "";
  }
}

const fmtDay = (day: DayKey, today: DayKey) => {
  const diff = daysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return fromDayKey(day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(day.slice(0, 4) !== today.slice(0, 4) && { year: "numeric" }),
  });
};

const minutesLabel = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`
    : `${minutes}m`;

// "45", "45m", "1h", "1h30", "90 min", "2 hours", "an hour", "half an hour" → minutes.
const DURATION =
  /(an?|half an?|\d+(?:\.\d+)?)\s*(h|hrs?|hours?|m|mins?|minutes?)(?:\s*(\d+)\s*(?:m|mins?|minutes?)?)?\b/i;
function readDuration(match: RegExpExecArray) {
  const amount = (match[1] ?? "").toLowerCase();
  const unit = (match[2] ?? "").toLowerCase();
  const value = amount.startsWith("half")
    ? 0.5
    : amount === "a" || amount === "an"
      ? 1
      : Number(amount);
  const hours = unit.startsWith("h");
  return Math.round(hours ? value * 60 + Number(match[3] ?? 0) : value);
}

interface DateHit {
  token: Token;
  day: DayKey;
  endDay?: DayKey;
  // A bare weekday ("Wednesday"), which moves a week on when its time has passed.
  bareWeekday: boolean;
}

const WEAK =
  /^(?:(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|rsday|urday)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i;
const LEAD = /(?:^|\s)(on|by|due|until|from|in|this|next|every|before)\s+$/i;
const DEADLINE_LEAD = /(?:^|\s)(!(?:deadline\s+)?|due\s+|by\s+|before\s+)$/i;
const WEEKDAY_RANGE =
  /\b(?:(next|this)\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\s*-\s*(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/gi;

/**
 * Parses Quick Entry text into an event or a to-do. Pure and fast enough to run on every
 * keystroke. `context.literals` are spans the user un-parsed; they stay in the title.
 */
export function parseQuickEntry(text: string, context: ParseContext & { kind: "task" }): TaskEntry;
export function parseQuickEntry(
  text: string,
  context: ParseContext & { kind: "event" },
): EventEntry;
export function parseQuickEntry(text: string, context: ParseContext): QuickEntry;
export function parseQuickEntry(text: string, context: ParseContext): QuickEntry {
  const now = context.now;
  const today = toDayKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const s = new Scanner(text, context.literals ?? []);
  const weekStart = context.weekStartsOn ?? 1;

  // 1. Mode prefix: "task …", "event …".
  let forced = context.kind;
  const mode = /^\s*(task|todo|to-do|reminder|event)\s+/i.exec(s.masked);
  if (mode) {
    const kind = (mode[1] ?? "").toLowerCase() === "event" ? "event" : "task";
    forced ??= kind;
    s.claim("mode", mode.index, mode.index + mode[0].length, kind === "event" ? "Event" : "To-do");
  }

  // 2. Sigils: URLs, attendees, lists, tags, estimates, priorities.
  let url: string | undefined;
  for (const m of s.masked.matchAll(/https?:\/\/[^\s]+/gi)) {
    url ??= m[0];
    const video = /(zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex\.com)/i.test(m[0]);
    s.claim("url", m.index, m.index + m[0].length, video ? "Video call" : "Link");
  }
  const attendees: string[] = [];
  for (const m of s.masked.matchAll(/(?:\bwith\s+|\+)([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gi)) {
    attendees.push(m[1] ?? "");
    s.claim("attendee", m.index, m.index + m[0].length, m[1] ?? "");
  }
  let listCalendar: string | undefined;
  let listProject: string | undefined;
  for (const m of s.masked.matchAll(/(?<=^|\s)\/([A-Za-z][\w-]*)/g)) {
    const name = (m[1] ?? "").toLowerCase();
    const calendar = context.calendars?.find((each) => each.title.toLowerCase().startsWith(name));
    const project = context.projects?.find((each) => each.title.toLowerCase().startsWith(name));
    if (!calendar && !project) continue;
    listCalendar = calendar?.id;
    listProject = project?.uuid;
    s.claim("list", m.index, m.index + m[0].length, calendar?.title ?? project?.title ?? "");
  }
  const tags: string[] = [];
  for (const m of s.masked.matchAll(/(?<=^|\s)#([A-Za-z][\w-]*)/g)) {
    tags.push(m[1] ?? "");
    s.claim("tag", m.index, m.index + m[0].length, `#${m[1]}`);
  }
  let estimate: number | undefined;
  for (const m of s.masked.matchAll(/(?<=^|\s)~(?:(\d+)h(?:(\d+)m?)?|(\d+)m?)(?=\s|$)/gi)) {
    const value = m[1] ? Number(m[1]) * 60 + Number(m[2] ?? 0) : Number(m[3]);
    if (!value) continue;
    estimate = value;
    s.claim("estimate", m.index, m.index + m[0].length, minutesLabel(value));
  }
  let priority: number | undefined;
  for (const m of s.masked.matchAll(/(?<=^|\s)p([1-4])(?=\s|$)/gi)) {
    priority = Number(m[1]);
    s.claim("priority", m.index, m.index + m[0].length, `P${m[1]}`);
  }

  // 3. Keyword phrases that hold a time or duration, before times are read:
  // "remind me at 9am", "alert 1h before", "for 1h".
  let reminder: TimeMatch | undefined;
  let reminderDay: DayKey | undefined;
  const remind = /\bremind me\b/i.exec(s.masked);
  const alerts: number[] = [];
  for (const m of s.masked.matchAll(
    /\b(?:alert|alarm)\s+(\d+)\s*(m|mins?|minutes?|h|hrs?|hours?)(?:\s+before)?\b/gi,
  )) {
    const minutes = /^h/i.test(m[2] ?? "") ? Number(m[1]) * 60 : Number(m[1]);
    alerts.push(minutes);
    s.claim("alert", m.index, m.index + m[0].length, `Alert ${minutesLabel(minutes)} before`);
  }
  let duration: number | undefined;
  for (const m of s.masked.matchAll(new RegExp(`\\bfor\\s+${DURATION.source}`, "gi"))) {
    const value = readDuration(new RegExp(DURATION.source, "i").exec(m[0].slice(3).trim()) ?? m);
    if (!value) continue;
    duration = value;
    s.claim("duration", m.index, m.index + m[0].length, `For ${minutesLabel(value)}`);
  }
  let allDay = false;
  for (const m of s.masked.matchAll(/\ball[ -]day\b/gi)) {
    allDay = true;
    s.claim("all_day", m.index, m.index + m[0].length, "All day");
  }

  // 4. Times and time ranges.
  const times = findTimes(s.masked, text);
  if (remind) {
    // The time right after "remind me" is the reminder, not the start.
    const after = times.find(
      (t) => s.masked.slice(remind.index + remind[0].length, t.start).trim() === "",
    );
    if (after) {
      reminder = after;
      times.splice(times.indexOf(after), 1);
      s.claim("reminder", remind.index, after.end, `Remind ${clockLabel(after.startMin)}`);
    }
  }
  for (const t of times) {
    const label =
      t.endMin === undefined
        ? clockLabel(t.startMin)
        : `${clockLabel(t.startMin)} – ${clockLabel(t.endMin)}`;
    s.claim(
      t.endMin === undefined ? "time" : "time_range",
      t.start,
      t.end,
      label,
      t.inferred ? "guess" : "certain",
    );
  }
  for (const m of text.matchAll(
    /\b(PST|PDT|PT|EST|EDT|ET|CST|CDT|CT|MST|MDT|MT|GMT|UTC|BST|CET|CEST|IST|JST|AEST)\b/g,
  )) {
    const inTime = times.some(
      (t) => (t.zone || t.endZone) && m.index >= t.start && m.index < t.end,
    );
    if (inTime)
      s.tokens.push({
        kind: "timezone",
        start: m.index,
        end: m.index + m[0].length,
        confidence: "certain",
        label: m[0],
        applied: true,
      });
  }
  const zone = times.find((t) => t.zone)?.zone;

  // 5. Repeat rules (times are already blanked, so "every Monday 7am" reads cleanly).
  const ruleMatch = findRule(s.masked);
  let rule: Rule | undefined;
  let untilDay: DayKey | undefined;
  let untilGuess = false;
  let count: number | undefined;
  if (ruleMatch) {
    rule = ruleMatch.rule;
    count = ruleMatch.count;
    if (ruleMatch.until) {
      const bare =
        WEAK.test(ruleMatch.until.text.trim()) && !/^\w+day$/i.test(ruleMatch.until.text.trim());
      // chrono reads "December" but not "Dec", so bare months are spelled out first.
      const untilText = bare ? monthName(ruleMatch.until.text.trim()) : ruleMatch.until.text;
      const [hit] = chrono.casual.parse(untilText, now, { forwardDate: true });
      if (hit) {
        const day = toDayKey(hit.start.date());
        // "until Dec": through the last day before December starts.
        untilDay = bare ? addDays(startOfMonth(day), -1) : day;
        untilGuess = bare;
      }
    }
    s.claim(
      "recurrence",
      ruleMatch.start,
      ruleMatch.end,
      ruleLabel(rule),
      untilGuess ? "guess" : "certain",
    );
  }

  // 6. Other keyword phrases: evening, someday/anytime.
  let evening = false;
  for (const m of s.masked.matchAll(/\b(tonight|this evening)\b/gi)) {
    evening = true;
    s.claim("evening", m.index, m.index + m[0].length, "This Evening");
  }
  let later: "someday" | "anytime" | undefined;
  for (const m of s.masked.matchAll(/\b(someday|anytime)\b/gi)) {
    later = (m[1] ?? "").toLowerCase() === "someday" ? "someday" : "anytime";
    s.claim("later", m.index, m.index + m[0].length, later === "someday" ? "Someday" : "Anytime");
  }

  // 7. Dates: weekday ranges ("next Tue–Thu"), then chrono for the rest.
  const dates: DateHit[] = [];
  const deadlines: DateHit[] = [];
  for (const m of s.masked.matchAll(WEEKDAY_RANGE)) {
    const first = dayCode(m[2] ?? "");
    const last = dayCode(m[3] ?? "");
    if (!first || !last) continue;
    const day = weekdayFrom(first, today, m[1]?.toLowerCase() === "next", weekStart);
    const span = (DAY_CODES.indexOf(last) - DAY_CODES.indexOf(first) + 7) % 7;
    const token = s.claim(
      "date_range",
      m.index,
      m.index + m[0].length,
      `${fmtDay(day, today)} – ${fmtDay(addDays(day, span), today)}`,
      "likely",
    );
    dates.push({ token, day, endDay: addDays(day, span), bareWeekday: false });
  }
  for (const hit of chrono.casual.parse(s.masked, now, { forwardDate: true })) {
    let start = hit.index;
    const end = hit.index + hit.text.length;
    const phrase = hit.text.trim();
    const before = s.masked.slice(0, start);
    const lead = LEAD.exec(before);
    const deadlineLead = DEADLINE_LEAD.exec(before);
    // A bare weekday or month counts only after a lead word or at the end (research/10 §2.3).
    const weak = WEAK.test(phrase);
    const applied = !weak || Boolean(lead) || Boolean(deadlineLead) || s.isTail(end);
    if (deadlineLead) start -= deadlineLead[1]?.length ?? 0;
    else if (lead && /^(on|by|due|until|from|before)$/i.test(lead[1] ?? ""))
      start -= lead[0].length - (lead[0].startsWith(" ") ? 1 : 0);
    let day = toDayKey(hit.start.date());
    const lower = phrase.toLowerCase();
    // "next week" means Monday of next week, not today + 7.
    if (/^next week$/.test(lower)) day = addDays(startOfWeek(today, weekStart), 7);
    const endDay = hit.end ? toDayKey(hit.end.date()) : undefined;
    const bareWeekday = /^(?:on\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/i.test(lower);
    const label =
      endDay && endDay !== day
        ? `${fmtDay(day, today)} – ${fmtDay(endDay, today)}`
        : fmtDay(day, today);
    if (!applied) {
      s.tokens.push({ kind: "when", start, end, confidence: "likely", label, applied: false });
      continue;
    }
    if (deadlineLead) {
      const token = s.claim("deadline", start, end, `Due ${fmtDay(day, today)}`);
      deadlines.push({ token, day, bareWeekday });
    } else {
      const kind = endDay && endDay !== day ? "date_range" : "when";
      const token = s.claim(kind, start, end, label, weak ? "likely" : "certain");
      dates.push({ token, day, endDay: endDay !== day ? endDay : undefined, bareWeekday });
    }
  }
  // Two dates of one kind: the rightmost wins, the rest go back to the title.
  const pickLast = <T extends { token: Token }>(hits: T[]) => {
    const sorted = [...hits].sort((a, b) => a.token.start - b.token.start);
    for (const loser of sorted.slice(0, -1)) loser.token.applied = false;
    return sorted.at(-1);
  };
  const date = pickLast(dates);
  const deadline = pickLast(deadlines);
  const time = pickLast(
    s.tokens
      .filter((t) => t.kind === "time" || t.kind === "time_range")
      .map((token) => ({ token, match: times.find((t) => t.start === token.start) })),
  );
  // Unapplied tokens' text returns to the title.
  for (const token of s.tokens) if (!token.applied) unblank(s, token);

  // 8. Locations: "at Blue Bottle", "@ office", read after dates and times are blanked.
  let location: string | undefined;
  for (const m of s.masked.matchAll(
    /(?:\bat\s+|@\s*)([A-Z0-9][\w'&.-]*(?:\s[A-Z0-9][\w'&.-]*)*)/g,
  )) {
    location ??= (m[1] ?? "").trim();
    s.claim("location", m.index, m.index + m[0].length, (m[1] ?? "").trim(), "likely");
  }

  // Event or to-do: the switch or prefix, else the stronger signals, else where it was typed.
  const has = (kind: TokenKind) => s.tokens.some((t) => t.applied && t.kind === kind);
  const eventSignals =
    Number(has("time_range")) +
    Number(has("date_range")) +
    Number(allDay) +
    Number(duration !== undefined && time !== undefined) +
    Number(location !== undefined) +
    Number(attendees.length > 0) +
    Number(url !== undefined) +
    Number(alerts.length > 0) +
    Number(zone !== undefined) +
    Number(listCalendar !== undefined && listProject === undefined);
  const taskSignals =
    Number(deadline !== undefined) +
    Number(estimate !== undefined) +
    Number(priority !== undefined) +
    Number(tags.length > 0) +
    Number(evening) +
    Number(later !== undefined) +
    Number(rule?.afterCompletion ?? false) +
    Number(reminder !== undefined) +
    Number(listProject !== undefined && listCalendar === undefined);
  const kind =
    forced ??
    (eventSignals > taskSignals
      ? "event"
      : taskSignals > eventSignals
        ? "task"
        : context.surface === "grid"
          ? "event"
          : "task");

  // The day things happen: the typed date, else the rule's first occurrence, else today.
  const t = time?.match;
  const startMin = t?.startMin;
  const passedToday = startMin !== undefined && !t?.zone && startMin <= nowMin;
  let day = date?.day;
  if (rule && !date) day = firstOccurrence(rule, today, passedToday);
  if (date?.bareWeekday && day === today && passedToday) day = addDays(day, 7);
  if (!day && startMin !== undefined) day = passedToday ? addDays(today, 1) : today;

  const title = buildTitle(s);
  const tokens = s.tokens
    .filter((token) => token.kind !== "mode" || token.applied)
    .map((token) => ({
      ...token,
      ...(token.end === text.length &&
        !/\s$/.test(text) &&
        token.kind !== "mode" && { pending: true }),
    }))
    .sort((a, b) => a.start - b.start);

  // Bounds of the rule, as RRULE needs them: a UTC time for timed events, a date otherwise.
  const rrule = rule
    ? toRRule(rule, {
        count,
        until:
          untilDay &&
          (kind === "event" && startMin !== undefined && !allDay
            ? utcStamp(zonedInstant(untilDay, startMin, zone ?? localTimeZone()))
            : untilDay.replace(/-/g, "")),
      })
    : undefined;

  if (kind === "event") {
    const entry: EventEntry = { kind, title, tokens, allDay: false, start: "", end: "" };
    if (rrule) entry.rrule = rrule;
    const eventZone = zone;
    const range = date?.endDay ?? undefined;
    if (t && day) {
      const startMs = zonedInstant(day, t.startMin, t.zone ?? localTimeZone());
      let endMs =
        t.endMin !== undefined
          ? zonedInstant(day, t.endMin, t.endZone ?? t.zone ?? localTimeZone())
          : startMs + (duration ?? context.defaultEventMin ?? 60) * 60_000;
      if (endMs <= startMs) endMs += DAY_MS;
      entry.start = isoIn(startMs, t.zone);
      entry.end = isoIn(endMs, t.endZone ?? t.zone);
      if (eventZone) entry.timeZone = eventZone;
    } else if (day) {
      entry.allDay = true;
      entry.start = day;
      entry.end = addDays(range ?? day, 1);
    } else {
      // No date or time: the next quarter hour today.
      const quarter = Math.ceil((nowMin + 1) / 15) * 15;
      const startMs = zonedInstant(today, quarter, localTimeZone());
      entry.start = isoIn(startMs);
      entry.end = isoIn(startMs + (duration ?? context.defaultEventMin ?? 60) * 60_000);
    }
    if (listCalendar) entry.calendarId = listCalendar;
    if (location) entry.location = location;
    if (url) entry.url = url;
    if (attendees.length) entry.attendees = attendees;
    if (alerts.length) entry.alertsMin = alerts;
    for (const token of tokens) {
      if (
        ["deadline", "estimate", "priority", "tag", "evening", "later", "reminder"].includes(
          token.kind,
        )
      ) {
        token.applied = false;
        token.label = `${token.label} (to-dos only)`;
      }
    }
    return entry;
  }

  const entry: TaskEntry = { kind, title, tokens };
  if (rrule) {
    entry.rrule = rrule;
    entry.repeat = rule?.afterCompletion ? "after_completion" : "fixed";
  }
  if (evening) {
    entry.when = "evening";
    entry.when_date = day ?? today;
  } else if (later && !day) entry.when = later;
  else if (day) {
    entry.when = "date";
    entry.when_date = day;
  }
  if (t && day) {
    entry.start_at = isoIn(zonedInstant(day, t.startMin, t.zone ?? localTimeZone()), t.zone);
    if (t.endMin !== undefined) {
      const length = (t.endMin - t.startMin + 24 * 60) % (24 * 60) || 24 * 60;
      entry.estimate_min = length;
    }
  }
  if (duration !== undefined) entry.estimate_min = duration;
  if (estimate !== undefined) entry.estimate_min = estimate;
  if (deadline) entry.deadline = deadline.day;
  if (priority !== undefined) entry.priority = priority;
  if (listProject) entry.project_uuid = listProject;
  if (tags.length) entry.tags = tags;
  if (reminder) {
    reminderDay = day ?? (reminder.startMin <= nowMin ? addDays(today, 1) : today);
    entry.reminder_at = isoIn(
      zonedInstant(reminderDay, reminder.startMin, reminder.zone ?? localTimeZone()),
      reminder.zone,
    );
  }
  for (const token of tokens) {
    if (["location", "attendee", "alert", "url", "all_day"].includes(token.kind)) {
      token.applied = false;
      token.label = `${token.label} (events only)`;
    }
  }
  return entry;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// The full name for a month abbreviation ("Dec" → "December").
const monthName = (text: string) =>
  MONTHS.find((month) => month.startsWith(text.toLowerCase().slice(0, 3))) ?? text;

/*
 * The day of weekday `code`: the next one on or after today, or with `next`, the one in
 * next calendar week ("next Friday" on a Wednesday is 9 days away).
 */
function weekdayFrom(code: string, today: DayKey, next: boolean, weekStart: number) {
  const index = DAY_CODES.indexOf(code as (typeof DAY_CODES)[number]);
  if (!next) return addDays(today, (index - weekday(today) + 7) % 7);
  return addDays(addDays(startOfWeek(today, weekStart), 7), (index - weekStart + 7) % 7);
}

// Puts an unapplied token's text back into the scan copy so the title keeps it.
function unblank(s: Scanner, token: Token) {
  const original = s.text.slice(token.start, token.end);
  s.masked = s.masked.slice(0, token.start) + original + s.masked.slice(token.end);
}

// The title: everything no applied token claimed, with quote marks dropped and space tidied.
function buildTitle(s: Scanner) {
  const drop = new Array<boolean>(s.text.length).fill(false);
  for (const token of s.tokens) {
    if (!token.applied) continue;
    for (let i = token.start; i < token.end; i++) drop[i] = true;
  }
  for (const [start, end] of s.quotes) {
    drop[start] = true;
    drop[end - 1] = true;
  }
  let title = "";
  for (let i = 0; i < s.text.length; i++) title += drop[i] ? " " : s.text[i];
  return title
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/(?:\s|^)(?:on|at|from|by|due|for|with|@|-|,)$/i, "")
    .trim();
}

// YYYYMMDDTHHMMSSZ for an RRULE UNTIL.
const utcStamp = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/**
 * The first day a rule happens on or after `today` (Todoist's "starts today"). With a
 * time that's already passed today, today doesn't count.
 */
function firstOccurrence(rule: Rule, today: DayKey, passedToday: boolean): DayKey {
  const from = passedToday ? addDays(today, 1) : today;
  for (let offset = 0; offset < 400; offset++) {
    const day = addDays(from, offset);
    if (matches(rule, day)) return day;
  }
  return from;
}

function matches(rule: Rule, day: DayKey) {
  const code = DAY_CODES[weekday(day)];
  if (rule.byMonthDay === -1) return addDays(day, 1).slice(8) === "01";
  if (!rule.byDay?.length) return true;
  return rule.byDay.some((entry) => {
    const nth = /^(-?\d)(\w\w)$/.exec(entry);
    if (!nth) return entry === code;
    if (nth[2] !== code) return false;
    const n = Number(nth[1]);
    const date = Number(day.slice(8));
    if (n > 0) return Math.ceil(date / 7) === n;
    return addMonths(startOfMonth(day), 1) <= addDays(day, 7);
  });
}
