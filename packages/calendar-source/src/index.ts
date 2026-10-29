/*
 * Calendars and events that live outside Cal: the accounts set up on the device (read
 * through EventKit on the Mac, expo-calendar on iOS), later Google directly. They are
 * read live and never stored in Convex.
 */

export type CalendarAccess = "notDetermined" | "fullAccess" | "writeOnly" | "denied" | "restricted";

export interface DeviceCalendar {
  id: string;
  title: string;
  // Opaque hex, e.g. "#1badf8".
  color: string;
  // The account it belongs to, e.g. "iCloud" or "me@gmail.com".
  account: string;
  writable: boolean;
}

export interface ExternalEvent {
  // Unique per occurrence, so each instance of a repeating event has its own id.
  id: string;
  calendarId: string;
  title: string;
  // ISO 8601 instants with offset. All-day events span local midnights.
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  url?: string;
  recurring: boolean;
  // The repeat rule as an RRULE string without the "RRULE:" prefix, e.g.
  // "FREQ=WEEKLY;BYDAY=MO,WE". Absent for one-off events.
  recurrence?: string;
  // For an occurrence of a repeating event: when the series' first occurrence runs, so
  // the whole series can be recreated from any occurrence (undoing "delete all").
  seriesStart?: string;
  seriesEnd?: string;
  // Whether the event blocks time; free events don't count as busy for scheduling.
  busy: boolean;
  // IANA time zone the event is pinned to; absent for floating (all-day) events.
  timeZone?: string;
  // Reminders, as minutes before the start.
  alarms?: number[];
  // Invitees, read-only: no API lets Cal add or remove them on the Mac.
  attendees?: Attendee[];
  // Your own response when you're an invitee; "declined" events can be hidden.
  myStatus?: "accepted" | "declined" | "tentative" | "pending";
}

export interface Attendee {
  name?: string;
  email?: string;
  status: "accepted" | "declined" | "tentative" | "pending" | "unknown";
  organizer: boolean;
}

export interface EventInput {
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  url?: string;
  // RRULE string (no "RRULE:" prefix); an empty string removes the repeat.
  recurrence?: string;
  busy?: boolean;
  timeZone?: string;
  // Minutes before the start; replaces the event's reminders.
  alarms?: number[];
}

/*
 * For repeating events: change only this occurrence, this and all later ones, or the
 * whole series. With "all", new start/end times given for one occurrence move every
 * occurrence by the same amount.
 */
export type EventSpan = "this" | "future" | "all";

export interface CalendarSource {
  access(): Promise<CalendarAccess>;
  requestAccess(): Promise<CalendarAccess>;
  calendars(): Promise<DeviceCalendar[]>;
  // Events overlapping [start, end), across `calendarIds` (all calendars if omitted).
  events(start: string, end: string, calendarIds?: readonly string[]): Promise<ExternalEvent[]>;
  createEvent(input: EventInput): Promise<ExternalEvent>;
  updateEvent(id: string, input: Partial<EventInput>, span: EventSpan): Promise<ExternalEvent>;
  deleteEvent(id: string, span: EventSpan): Promise<void>;
  // Called when anything changes in the device's calendars; returns an unsubscribe.
  onChange(listener: () => void): () => void;
}
