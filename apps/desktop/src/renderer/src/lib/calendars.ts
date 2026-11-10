import type { DeviceCalendar, ExternalEvent } from "@cal/calendar-source";
import { type ChipColors, chipColorsFromHex, type Mode } from "@cal/theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
 * Device calendars and their events, read live from the main process. Events are
 * fetched for the visible range and again whenever the device reports a change.
 */

export function useCalendars() {
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  useEffect(() => {
    let active = true;
    const load = () =>
      window.cal.calendar
        .calendars()
        .then((list) => active && setCalendars(list))
        .catch(() => undefined);
    void load();
    const stop = window.cal.calendar.onChange(() => void load());
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
  // The range on screen now. `refresh` is kept by undo steps long after the view moves
  // on, so it always reloads this range, and drops results for a range no longer shown.
  const range = useRef({ start, end });
  range.current = { start, end };
  // Fixture calendars never report changes, so edits made here refresh explicitly.
  const refresh = useCallback(async () => {
    const wanted = range.current;
    const events = await window.cal.calendar.events(wanted.start, wanted.end).catch(() => []);
    const now = range.current;
    if (now.start === wanted.start && now.end === wanted.end) setState({ events, loaded: true });
  }, []);
  // Without calendar access the fetch fails: the grid simply shows no device events.
  useEffect(() => {
    let active = true;
    const load = () =>
      window.cal.calendar
        .events(start, end)
        .catch(() => [])
        .then((events) => {
          if (active) setState({ events, loaded: true });
        });
    void load();
    const stop = window.cal.calendar.onChange(() => void load());
    return () => {
      active = false;
      stop();
    };
  }, [start, end]);
  return { ...state, refresh };
}

// Chip colors per calendar for the current mode, computed once per calendar. A color
// override from Settings replaces the calendar's own color here, never in the calendar.
export function useChipPalette(
  calendars: readonly DeviceCalendar[],
  mode: Mode,
  overrides: Readonly<Record<string, string>>,
) {
  return useMemo(() => {
    const palette = new Map<string, ChipColors>();
    for (const calendar of calendars) {
      palette.set(calendar.id, chipColorsFromHex(calendarColor(calendar, overrides), mode));
    }
    return palette;
  }, [calendars, mode, overrides]);
}

// Events the grid shows: none from hidden calendars, and declined ones only when asked.
export function visibleEvents(
  events: readonly ExternalEvent[],
  hiddenCalendars: readonly string[],
  showDeclined: boolean,
) {
  const hidden = new Set(hiddenCalendars);
  return events.filter(
    (event) => !hidden.has(event.calendarId) && (showDeclined || event.myStatus !== "declined"),
  );
}

// A calendar's color in Cal: the override from Settings, else the calendar's own.
export const calendarColor = (
  calendar: DeviceCalendar,
  overrides: Readonly<Record<string, string>>,
) => overrides[calendar.id] ?? calendar.color;

// Calendars grouped by account, accounts in the order their first calendar appears.
export function byAccount(calendars: readonly DeviceCalendar[]) {
  const accounts = [...new Set(calendars.map((calendar) => calendar.account))];
  return accounts.map((account) => ({
    account,
    calendars: calendars.filter((calendar) => calendar.account === account),
  }));
}

// `list` with `id` added (on) or removed (off): hidden or free calendar ids.
export const withId = (list: readonly string[], id: string, on: boolean) =>
  on ? [...new Set([...list, id])] : list.filter((each) => each !== id);

/**
 * The hidden list after ⌥-clicking calendar `id`: everything but it is hidden, or, when
 * it's already the only one showing, every calendar shows again.
 */
export function soloCalendar(
  calendars: readonly DeviceCalendar[],
  hidden: readonly string[],
  id: string,
) {
  const shown = calendars.filter((calendar) => !hidden.includes(calendar.id));
  if (shown.length === 1 && shown[0]?.id === id) return [];
  return calendars.filter((calendar) => calendar.id !== id).map((calendar) => calendar.id);
}

// A fallback for events whose calendar isn't listed (shouldn't happen, but never crash).
export const graphite = (mode: Mode) => chipColorsFromHex("#888888", mode);
