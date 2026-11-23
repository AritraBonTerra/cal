import type { DeviceCalendar, ExternalEvent } from "@cal/calendar-source";
import type { Meeting } from "@cal/domain";
import { router } from "expo-router";
import { Alert, Linking } from "react-native";

// What an event's sheet shows.
export interface EventDetails {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  url?: string;
  calendar: string;
  color: string;
}

/**
 * Opens an event's sheet. Device events aren't stored, so the route carries what it shows,
 * packed: the router decodes params more than once, which would undo the escapes inside a
 * call's link. Packed text holds no "%", so decoding it again changes nothing.
 */
export function openEvent(event: ExternalEvent, calendars: readonly DeviceCalendar[]) {
  const calendar = calendars.find((each) => each.id === event.calendarId);
  const { title, start, end, allDay, location, notes, url } = event;
  const details: EventDetails = {
    title,
    start,
    end,
    allDay,
    location,
    notes,
    url,
    calendar: calendar?.title ?? "",
    color: calendar?.color ?? "#888888",
  };
  const packed = encodeURIComponent(JSON.stringify(details))
    .replaceAll("~", "%7E")
    .replaceAll("%", "~");
  router.push({ pathname: "/event/[id]", params: { id: event.id, event: packed } });
}

// The details `openEvent` packed into the route.
export const unpackEvent = (packed: string): EventDetails =>
  JSON.parse(decodeURIComponent(packed.replaceAll("~", "%")));

// Opens a call by its https link, which iOS hands to the service's app when it's
// installed and to the browser otherwise.
export function joinMeeting({ service, url }: Meeting) {
  Linking.openURL(url).catch(() =>
    Alert.alert(`Couldn't open ${service}`, "iOS couldn't open this call's link."),
  );
}
