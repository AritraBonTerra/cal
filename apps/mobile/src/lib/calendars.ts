import type { DeviceCalendar, ExternalEvent } from "@cal/calendar-source";
import { type ChipColors, chipColorsFromHex, type Mode } from "@cal/theme";
import { useCallback, useEffect, useMemo, useState } from "react";
import { calendar } from "../data/cal";

/*
 * Device calendars and their events, read live from expo-calendar (or the fixtures).
 * Events are fetched for the visible range and again whenever the source reports a
 * change (on iOS, each return to the foreground).
 */

export function useCalendars() {
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  useEffect(() => {
    let active = true;
    const load = () =>
      calendar
        .calendars()
        .then((list) => active && setCalendars(list))
        .catch(() => undefined);
    void load();
    const stop = calendar.onChange(() => void load());
    return () => {
      active = false;
      stop();
    };
  }, []);
  return calendars;
}

// Events overlapping [start, end) as ISO strings. A new range keeps the last one's events
// until its own arrive; `loaded` says whether they have.
export function useEvents(start: string, end: string) {
  const range = `${start}/${end}`;
  const [state, setState] = useState<{ events: ExternalEvent[]; range?: string }>({ events: [] });
  // Without calendar access the fetch fails: the grid simply shows no device events.
  const refresh = useCallback(async () => {
    const events = await calendar.events(start, end).catch(() => []);
    setState({ events, range });
  }, [start, end, range]);
  useEffect(() => {
    let active = true;
    const load = () =>
      calendar
        .events(start, end)
        .catch(() => [])
        .then((events) => {
          if (active) setState({ events, range });
        });
    void load();
    const stop = calendar.onChange(() => void load());
    return () => {
      active = false;
      stop();
    };
  }, [start, end, range]);
  return { events: state.events, loaded: state.range === range, refresh };
}

// Chip colors per calendar for the current mode, computed once per calendar.
export function useChipPalette(calendars: readonly DeviceCalendar[], mode: Mode) {
  return useMemo(() => {
    const palette = new Map<string, ChipColors>();
    for (const each of calendars) palette.set(each.id, chipColorsFromHex(each.color, mode));
    return palette;
  }, [calendars, mode]);
}

// A fallback for events whose calendar isn't listed (shouldn't happen, but never crash).
export const graphite = (mode: Mode) => chipColorsFromHex("#888888", mode);
