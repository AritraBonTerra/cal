import type { DeviceCalendar, ExternalEvent } from "@cal/calendar-source";
import type { Meeting } from "@cal/domain";
import { router } from "expo-router";
import { Alert, Linking } from "react-native";

// Opens an event's sheet. Device events aren't stored, so the route carries what it shows.
export function openEvent(event: ExternalEvent, calendars: readonly DeviceCalendar[]) {
  const calendar = calendars.find((each) => each.id === event.calendarId);
  router.push({
    pathname: "/event/[id]",
    params: {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay ? "1" : "0",
      location: event.location ?? "",
      notes: event.notes ?? "",
      url: event.url ?? "",
      calendar: calendar?.title ?? "",
      color: calendar?.color ?? "#888888",
    },
  });
}

// Opens a call by its https link, which iOS hands to the service's app when it's
// installed and to the browser otherwise.
export function joinMeeting({ service, url }: Meeting) {
  Linking.openURL(url).catch(() =>
    Alert.alert(`Couldn't open ${service}`, "iOS couldn't open this call's link."),
  );
}
