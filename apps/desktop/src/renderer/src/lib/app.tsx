import type { DeviceCalendar, ExternalEvent } from "@cal/calendar-source";
import type { DayKey } from "@cal/domain";
import type { ChipColors, Mode } from "@cal/theme";
import { createContext, useContext } from "react";
import type { useData } from "./data";

/*
 * Everything the views share once per window: the live tables, device calendars with
 * their chip colors, the events in the visible range, the color mode and today.
 */
export interface AppState {
  data: ReturnType<typeof useData>;
  calendars: readonly DeviceCalendar[];
  palette: ReadonlyMap<string, ChipColors>;
  events: readonly ExternalEvent[];
  refreshEvents: () => Promise<void>;
  mode: Mode;
  today: DayKey;
  // Days shown by the current view, first to last.
  days: readonly DayKey[];
}

export const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp needs <AppContext.Provider>");
  return state;
}
