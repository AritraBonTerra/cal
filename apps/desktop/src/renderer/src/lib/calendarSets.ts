import { activeSet, type CalendarSet, type DeviceSettings, hiddenWith } from "@cal/app-core";
import type { DeviceCalendar } from "@cal/calendar-source";
import { useMemo } from "react";
import { useNow } from "./clock";

/**
 * The calendar set in force (undefined for every calendar) and the calendars not
 * showing. Automatic follows the clock, so a set's hours start and end on the minute.
 */
export function useCalendarSet(calendars: readonly DeviceCalendar[], device: DeviceSettings) {
  const now = useNow();
  const set = activeSet(device.calendarSets, device.calendarSet, now);
  const hidden = useMemo(
    () => hiddenWith(set, calendars, device.hiddenCalendars),
    [set, calendars, device.hiddenCalendars],
  );
  return { set, hidden };
}

// What the set menu calls the choice in force: "Work", or "Work · auto".
export const setLabel = (set: CalendarSet | undefined, choice: string) =>
  set ? (choice === "auto" ? `${setName(set)} · auto` : setName(set)) : "All";

export const setName = (set: CalendarSet) => set.name.trim() || "Untitled set";
