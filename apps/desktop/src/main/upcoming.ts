import { agendaDays, type TimedEntry } from "@cal/app-core";
import type { ExternalEvent } from "@cal/calendar-source";
import {
  addDays,
  type DayKey,
  eventToJoin,
  fromDayKey,
  type Habit,
  type HabitEntry,
  latestEntries,
  localTimeZone,
  meetingOf,
  type Project,
  type Task,
  type TimeBlock,
  toDayKey,
} from "@cal/domain";
import type { DeskPrefs } from "../shared/api";

/*
 * What the menu bar and notifications say (main/desk.ts shows it), worked out from the
 * day's events and the local tables. No Electron here, so it can be tested.
 */

const MINUTE = 60_000;

// "9:30 AM" or "09:30", on this Mac's clock.
export function clockText(at: Date, hour12: boolean) {
  const minutes = String(at.getMinutes()).padStart(2, "0");
  if (!hour12) return `${String(at.getHours()).padStart(2, "0")}:${minutes}`;
  const hour = at.getHours() % 12 || 12;
  return `${hour}${minutes === "00" ? "" : `:${minutes}`} ${at.getHours() < 12 ? "AM" : "PM"}`;
}

// "45m", "1h", "1h30".
function lengthText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

// Events the user sees: not in a hidden calendar, and not declined unless those show.
export const shownEvents = (events: readonly ExternalEvent[], prefs: DeskPrefs) =>
  events.filter(
    (event) =>
      !prefs.hiddenCalendars.includes(event.calendarId) &&
      (prefs.showDeclined || event.myStatus !== "declined"),
  );

const timed = (events: readonly ExternalEvent[]) =>
  events.filter((event) => !event.allDay && event.myStatus !== "declined");

// Minutes from `now` to an event's start, rounded up so "in 1m" never reads "in 0m".
const minutesTo = (event: ExternalEvent, now: Date) =>
  Math.ceil((Date.parse(event.start) - now.getTime()) / MINUTE);

const LONGEST_TITLE = 28;
const short = (title: string) =>
  title.length > LONGEST_TITLE ? `${title.slice(0, LONGEST_TITLE - 1).trimEnd()}…` : title;

/**
 * The menu bar's text: the next event today with a countdown in its last hour
 * ("Standup in 5m") or its time before that, or the event on now with what's left of it
 * when nothing starts in the next ten minutes. Empty once the day's events are over.
 */
export function menuBarTitle(events: readonly ExternalEvent[], now: Date, hour12: boolean) {
  const today = toDayKey(now);
  const ahead = timed(events)
    .filter((event) => Date.parse(event.end) > now.getTime())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const next = ahead.find((event) => Date.parse(event.start) > now.getTime());
  const current = ahead.findLast((event) => Date.parse(event.start) <= now.getTime());
  if (current && !(next && minutesTo(next, now) <= 10)) {
    const left = Math.ceil((Date.parse(current.end) - now.getTime()) / MINUTE);
    return `${short(current.title)} · ${lengthText(left)} left`;
  }
  if (!next || toDayKey(new Date(next.start)) !== today) return "";
  const minutes = minutesTo(next, now);
  return minutes <= 60
    ? `${short(next.title)} in ${lengthText(minutes)}`
    : `${short(next.title)} ${clockText(new Date(next.start), hour12)}`;
}

// The local tables the day is drawn from.
export interface DeskData {
  events: readonly ExternalEvent[];
  tasks: readonly Task[];
  blocks: readonly TimeBlock[];
  projects: readonly Project[];
  habits: readonly Habit[];
  entries: readonly HabitEntry[];
}

// Today's agenda on this Mac's clock.
function todayOf(data: DeskData, now: Date) {
  const today = toDayKey(now);
  const [day] = agendaDays([today], {
    ...data,
    entries: latestEntries(data.entries),
    gridToday: today,
    today,
    zone: localTimeZone(),
  });
  return day;
}

export interface MenuModel {
  // The call to offer: the one on now or next today.
  join?: { label: string; url: string };
  day: DayKey;
  // All-day events, then what's still to come today.
  rows: { label: string; eventId?: string }[];
}

const rowTitle = (entry: TimedEntry) =>
  entry.kind === "event" ? entry.event.title : (entry.task?.title ?? "Block");

export function menuModel(data: DeskData, now: Date, hour12: boolean): MenuModel {
  const day = todayOf(data, now);
  const call = eventToJoin(
    data.events.filter((event) => toDayKey(new Date(event.start)) <= toDayKey(now)),
    now,
  );
  const meeting = call && meetingOf(call);
  return {
    join: meeting && { label: `Join ${short(call.title)} (${meeting.service})`, url: meeting.url },
    day: toDayKey(now),
    rows: [
      ...(day?.allDay ?? []).map((event) => ({
        label: `All day   ${short(event.title)}`,
        eventId: event.id,
      })),
      ...(day?.timed ?? [])
        .filter((entry) => entry.end.getTime() > now.getTime())
        .map((entry) => ({
          label: `${clockText(entry.start, hour12)}   ${short(rowTitle(entry))}`,
          eventId: entry.kind === "event" ? entry.event.id : undefined,
        })),
    ],
  };
}

/**
 * Events whose call starts within the minute (or began within the last one, for a Mac
 * just woken), that aren't in `seen` yet. Keyed by start, so a moved event is new again.
 */
export function startingCalls(
  events: readonly ExternalEvent[],
  now: Date,
  seen: ReadonlySet<string>,
) {
  return timed(events).filter((event) => {
    const away = Date.parse(event.start) - now.getTime();
    return (
      away <= MINUTE &&
      away > -MINUTE &&
      !seen.has(callKey(event)) &&
      meetingOf(event) !== undefined
    );
  });
}

export const callKey = (event: ExternalEvent) => `${event.id}@${Date.parse(event.start)}`;

// How late the morning summary may come, for a Mac opened after its time.
const SUMMARY_LATE_MIN = 4 * 60;

// Whether the morning summary set for `minutes` after midnight is due, given the last
// day it was shown.
export function summaryDue(minutes: number | null, now: Date, shown: DayKey | undefined) {
  if (minutes === null || shown === toDayKey(now)) return false;
  const late = now.getHours() * 60 + now.getMinutes() - minutes;
  return late >= 0 && late < SUMMARY_LATE_MIN;
}

const count = (amount: number, word: string) => `${amount} ${word}${amount === 1 ? "" : "s"}`;

const summaryDay = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

// The morning summary: how many events and when the first starts, to-dos, and habits.
export function morningSummary(data: DeskData, now: Date, hour12: boolean) {
  const day = todayOf(data, now);
  const events = (day?.timed ?? []).filter(
    (entry) => entry.kind === "event" && entry.event.myStatus !== "declined",
  );
  const first = events.find((entry) => entry.start.getTime() > now.getTime());
  const scheduled = new Set(
    (day?.timed ?? []).flatMap((entry) =>
      entry.kind === "block" && entry.block.done_at === undefined ? (entry.task?.uuid ?? []) : [],
    ),
  );
  const todos = (day?.tasks.length ?? 0) + scheduled.size;
  const habits = day?.habits.length ?? 0;
  const parts = [
    events.length > 0 &&
      `${count(events.length, "event")}${
        first ? `, first ${rowTitle(first)} at ${clockText(first.start, hour12)}` : ""
      }`,
    ...(day?.allDay ?? []).map((event) => event.title),
    todos > 0 && count(todos, "to-do"),
    habits > 0 && count(habits, "habit"),
  ].filter((part) => typeof part === "string");
  return {
    title: summaryDay.format(now),
    body: parts.length > 0 ? parts.join(" · ") : "Nothing planned today",
  };
}

// The span events are read for: today and tomorrow, so a call just after midnight counts.
export function deskRange(now: Date) {
  const today = toDayKey(now);
  return { start: fromDayKey(today), end: fromDayKey(addDays(today, 2)) };
}
