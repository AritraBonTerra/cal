import type { DeviceCalendar } from "@cal/calendar-source";
import type { DayKey } from "@cal/domain";
import type { ChipColors, Mode } from "@cal/theme";
import { createContext, type ReactNode, useContext } from "react";
import { useCalendars, useChipPalette } from "./calendars";
import { useToday } from "./clock";
import { useData } from "./data";
import { useMode } from "./theme";

/*
 * Everything the screens share: the live tables, device calendars with their chip
 * colors, the color mode and today. Events are fetched per visible range by the grid.
 */
export interface AppState {
  data: ReturnType<typeof useData>;
  calendars: readonly DeviceCalendar[];
  palette: ReadonlyMap<string, ChipColors>;
  mode: Mode;
  today: DayKey;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const data = useData();
  const calendars = useCalendars();
  const mode = useMode();
  const palette = useChipPalette(calendars, mode);
  const today = useToday();
  return (
    <AppContext.Provider value={{ data, calendars, palette, mode, today }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp needs <AppProvider>");
  return state;
}
