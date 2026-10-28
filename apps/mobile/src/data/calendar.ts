import type {
  CalendarAccess,
  CalendarSource,
  DeviceCalendar,
  EventInput,
  EventSpan,
  ExternalEvent,
} from "@cal/calendar-source";
import { toOffsetIso } from "@cal/domain";
import * as Calendar from "expo-calendar/legacy";
import { AppState } from "react-native";
import { fromExpoRule, toExpoRule } from "./rules";

const iso = (value: string | Date) => toOffsetIso(new Date(value));

function access({ status, granted }: { status: string; granted: boolean }): CalendarAccess {
  if (granted) return "fullAccess";
  return status === "undetermined" ? "notDetermined" : "denied";
}

/*
 * An occurrence's id: the event id, plus the occurrence's original start for repeating
 * events, since EventKit gives all occurrences one id (as calkit does on the Mac).
 */
function eventId(event: Calendar.Event) {
  return event.recurrenceRule ? `${event.id}|${iso(event.startDate)}` : event.id;
}

function parseId(id: string) {
  const [eventIdentifier = id, instance] = id.split("|");
  return { eventIdentifier, instanceStartDate: instance ? new Date(instance) : undefined };
}

function toExternal(event: Calendar.Event): ExternalEvent {
  return {
    id: eventId(event),
    calendarId: event.calendarId,
    title: event.title,
    start: iso(event.startDate),
    end: iso(event.endDate),
    allDay: event.allDay,
    location: event.location || undefined,
    notes: event.notes || undefined,
    url: event.url || undefined,
    recurring: event.recurrenceRule !== null,
    ...(event.recurrenceRule && { recurrence: fromExpoRule(event.recurrenceRule) }),
    busy: event.availability !== Calendar.Availability.FREE,
    ...(!event.allDay && event.timeZone && { timeZone: event.timeZone }),
    ...(event.alarms.length && {
      alarms: event.alarms.flatMap((alarm) =>
        alarm.relativeOffset === undefined ? [] : [-alarm.relativeOffset],
      ),
    }),
  };
}

const toDetails = (input: Partial<EventInput>) => ({
  ...(input.title !== undefined && { title: input.title }),
  ...(input.start !== undefined && { startDate: new Date(input.start) }),
  ...(input.end !== undefined && { endDate: new Date(input.end) }),
  ...(input.allDay !== undefined && { allDay: input.allDay }),
  ...(input.location !== undefined && { location: input.location }),
  ...(input.notes !== undefined && { notes: input.notes }),
  ...(input.url !== undefined && { url: input.url }),
  ...(input.timeZone !== undefined && { timeZone: input.timeZone }),
  ...(input.busy !== undefined && {
    availability: input.busy ? Calendar.Availability.BUSY : Calendar.Availability.FREE,
  }),
  ...(input.alarms !== undefined && {
    alarms: input.alarms.map((minutes) => ({ relativeOffset: -minutes })),
  }),
  ...(input.recurrence !== undefined && {
    recurrenceRule: input.recurrence ? toExpoRule(input.recurrence) : null,
  }),
});

// The device's calendars on iPhone and iPad, through expo-calendar (EventKit).
export const deviceCalendar: CalendarSource = {
  access: async () => access(await Calendar.getCalendarPermissionsAsync()),
  requestAccess: async () => access(await Calendar.requestCalendarPermissionsAsync()),

  async calendars(): Promise<DeviceCalendar[]> {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return calendars.map((calendar) => ({
      id: calendar.id,
      title: calendar.title,
      color: calendar.color,
      account: calendar.source.name,
      writable: calendar.allowsModifications,
    }));
  },

  async events(start, end, calendarIds) {
    const ids = calendarIds ?? (await this.calendars()).map((calendar) => calendar.id);
    if (ids.length === 0) return [];
    const events = await Calendar.getEventsAsync([...ids], new Date(start), new Date(end));
    return events.map(toExternal).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  },

  async createEvent(input) {
    const id = await Calendar.createEventAsync(input.calendarId, toDetails(input));
    return toExternal(await Calendar.getEventAsync(id));
  },

  async updateEvent(id: string, input: Partial<EventInput>, span: EventSpan) {
    const { eventIdentifier, instanceStartDate } = parseId(id);
    if (span === "all") {
      // The whole series: edit its first event, and turn new times for this occurrence
      // into a shift ("30 minutes later") so every occurrence moves, not just to this date.
      const occurrence = await Calendar.getEventAsync(eventIdentifier, {
        instanceStartDate: instanceStartDate?.toISOString(),
      });
      const first = await Calendar.getEventAsync(eventIdentifier);
      const shift = (to: string | undefined, from: string | Date, base: string | Date) =>
        to === undefined
          ? undefined
          : new Date(
              new Date(base).getTime() + Date.parse(to) - new Date(from).getTime(),
            ).toISOString();
      const shifted = {
        ...input,
        start: shift(input.start, occurrence.startDate, first.startDate),
        end: shift(input.end, occurrence.endDate, first.endDate),
      };
      await Calendar.updateEventAsync(eventIdentifier, toDetails(shifted), { futureEvents: true });
      return toExternal(await Calendar.getEventAsync(eventIdentifier));
    }
    const options = { instanceStartDate, futureEvents: span === "future" };
    const savedId = await Calendar.updateEventAsync(eventIdentifier, toDetails(input), options);
    // expo-calendar finds an occurrence by its current start, which may have just moved.
    const readStart =
      instanceStartDate && (input.start ? new Date(input.start) : instanceStartDate);
    return toExternal(
      await Calendar.getEventAsync(savedId || eventIdentifier, {
        instanceStartDate: readStart?.toISOString(),
      }),
    );
  },

  async deleteEvent(id: string, span: EventSpan) {
    const { eventIdentifier, instanceStartDate } = parseId(id);
    await Calendar.deleteEventAsync(eventIdentifier, {
      instanceStartDate: span === "all" ? undefined : instanceStartDate,
      futureEvents: span !== "this",
    });
  },

  // iOS gives no change feed here, so re-read whenever the app comes back to the foreground.
  onChange(listener) {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") listener();
    });
    return () => subscription.remove();
  },
};
