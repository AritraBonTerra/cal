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

// Events overlapping [start, end) as ISO strings; `loaded` is false until the first fetch.
export function useEvents(start: string, end: string) {
  const [state, setState] = useState<{ events: ExternalEvent[]; loaded: boolean }>({
    events: [],
    loaded: false,
  });
  // Without calendar access the fetch fails: the grid simply shows no device events.
  const refresh = useCallback(async () => {
    const events = await calendar.events(start, end).catch(() => []);
    setState({ events, loaded: true });
  }, [start, end]);
  useEffect(() => {
    let active = true;
    const load = () =>
      calendar
        .events(start, end)
        .catch(() => [])
        .then((events) => {
          if (active) setState({ events, loaded: true });
        });
    void load();
    const stop = calendar.onChange(() => void load());
    return () => {
      active = false;
      stop();
    };
  }, [start, end]);
  return { ...state, refresh };
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
