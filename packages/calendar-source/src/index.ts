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
  // Whether the event blocks time; free events don't count as busy for scheduling.
  busy: boolean;
}

export interface EventInput {
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string;
}

// For repeating events: change only this occurrence, or this and all later ones.
export type EventSpan = "this" | "future";

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
