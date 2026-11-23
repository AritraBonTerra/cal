import type { AccountSettings, CalendarSet, DeviceSettings } from "@cal/app-core";
import type { DeviceCalendar, ExternalEvent } from "@cal/calendar-source";
import type { DayKey } from "@cal/domain";
import type { ChipColors, Mode, Palette } from "@cal/theme";
import { createContext, useContext } from "react";
import type { useData } from "./data";

/*
 * Everything the views share once per window: the live tables, device calendars with
 * their chip colors, the events in the visible range, the color mode, today, and the
 * settings in force.
 */
export interface AppState {
  data: ReturnType<typeof useData>;
  calendars: readonly DeviceCalendar[];
  // The calendar set in force; undefined shows every calendar.
  calendarSet: CalendarSet | undefined;
  // Calendars not showing: hidden by hand, or outside the set.
  hidden: readonly string[];
  // Chip colors by calendar id.
  palette: ReadonlyMap<string, ChipColors>;
  // The theme's colors as hex.
  colors: Palette;
  // Visible events, already without hidden calendars and declined invitations.
  events: readonly ExternalEvent[];
  // Visible events from today on (two months' worth), whatever days the view shows.
  upcoming: readonly ExternalEvent[];
  refreshEvents: () => Promise<void>;
  mode: Mode;
  // Today on this Mac: what to-dos and habits count as today.
  today: DayKey;
  // Days shown by the current view, first to last.
  days: readonly DayKey[];
  account: AccountSettings;
  device: DeviceSettings;
  // The IANA zone the grid renders in: the travel zone, the fixed primary, or the Mac's.
  zone: string;
  // Today in `zone`; differs from `today` only while viewing another zone.
  gridToday: DayKey;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp needs <AppContext.Provider>");
  return state;
}
