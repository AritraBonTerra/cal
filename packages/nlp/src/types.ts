import type { DayKey } from "@cal/domain";

/*
 * The shapes of a Quick Entry parse (research/10 §4). A parse is a pure function of the
 * text and context, so the editor can re-run it on every keystroke.
 */

export type TokenKind =
  | "mode"
  | "when"
  | "time"
  | "time_range"
  | "date_range"
  | "all_day"
  | "duration"
  | "estimate"
  | "deadline"
  | "evening"
  | "later"
  | "recurrence"
  | "timezone"
  | "alert"
  | "reminder"
  | "location"
  | "attendee"
  | "list"
  | "tag"
  | "priority"
  | "url";

// certain: unambiguous syntax; likely: a sensible reading; guess: inferred (am/pm…).
export type Confidence = "certain" | "likely" | "guess";

// One recognized span of the input, in UTF-16 offsets into the original text.
export interface Token {
  kind: TokenKind;
  start: number;
  end: number;
  confidence: Confidence;
  // Chip text, e.g. "Fri, Oct 30" or "Every 2 weeks".
  label: string;
  // False for suggestions (a weekday inside the title) and readings that lost to another.
  applied: boolean;
  // Still being typed: ends at the end of the text with no space after it.
  pending?: boolean;
}

interface Common {
  title: string;
  tokens: Token[];
  // RFC 5545 rule body without "RRULE:", e.g. "FREQ=WEEKLY;BYDAY=MO".
  rrule?: string;
}

export interface EventEntry extends Common {
  kind: "event";
  allDay: boolean;
  // ISO 8601 with offset; all-day events use YYYY-MM-DD with an exclusive end.
  start: string;
  end: string;
  // IANA zone when the text named one; the device zone otherwise.
  timeZone?: string;
  calendarId?: string;
  location?: string;
  url?: string;
  // Emails; device calendars can't invite, so the app notes them.
  attendees?: string[];
  // Minutes before the start.
  alertsMin?: number[];
}

export interface TaskEntry extends Common {
  kind: "task";
  when?: "date" | "evening" | "someday" | "anytime";
  when_date?: DayKey;
  // A time block to place, ISO with offset.
  start_at?: string;
  deadline?: DayKey;
  estimate_min?: number;
  priority?: number;
  project_uuid?: string;
  tags?: string[];
  reminder_at?: string;
  repeat?: "fixed" | "after_completion";
}

export type QuickEntry = EventEntry | TaskEntry;

// Where the entry was typed; breaks event-vs-task ties.
export type Surface = "quick" | "grid" | "list";

export interface ParseContext {
  now: Date;
  surface?: Surface;
  // Device calendars and projects/areas that `/name` can pick.
  calendars?: readonly { id: string; title: string }[];
  projects?: readonly { uuid: string; title: string }[];
  // Spans the user un-parsed; their text stays in the title.
  literals?: readonly { start: number; end: number }[];
  // Forces the kind (the Event | To-do switch).
  kind?: "event" | "task";
  // 0 = Sunday, 1 = Monday.
  weekStartsOn?: number;
  // Length of an event with a start time but no end.
  defaultEventMin?: number;
}
