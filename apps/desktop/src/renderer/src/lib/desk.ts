import { type AccountSettings, type DeviceSettings, useSettings } from "@cal/app-core";
import { addDays, type DayKey, fromDayKey, toOffsetIso, weekday } from "@cal/domain";
import { useEffect, useRef } from "react";
import { useToday } from "./clock";
import { openEdit } from "./events";
import { usesHour12 } from "./time";
import { closeOverlay, jumpTo, select } from "./ui";

/*
 * The window's side of Cal outside its window (main/desk.ts): it reports the settings
 * the menu bar and notifications follow, shows what they ask for, and draws the Dock icon.
 */

// Reports the settings the menu bar and notifications follow.
export function useDeskPrefs(account: AccountSettings, device: DeviceSettings) {
  const { showDeclined } = account;
  const { hiddenCalendars, calendarSets, calendarSet, menuBar, callNotices, morningSummary } =
    device;
  const hour12 = usesHour12();
  useEffect(() => {
    void window.cal.setDesk({
      hiddenCalendars,
      calendarSets,
      calendarSet,
      showDeclined,
      hour12,
      menuBar,
      callNotices,
      morningSummary,
    });
  }, [
    hiddenCalendars,
    calendarSets,
    calendarSet,
    showDeclined,
    hour12,
    menuBar,
    callNotices,
    morningSummary,
  ]);
}

// Shows the day (and opens the event) the menu bar or a notification was clicked for. The
// event is fetched here: a window just opened hasn't loaded any yet.
export function useReveal(gridToday: DayKey, showWeekends: boolean, zone: string) {
  const latest = useRef({ gridToday, showWeekends, zone });
  latest.current = { gridToday, showWeekends, zone };
  useEffect(
    () =>
      window.cal.onReveal(({ day, eventId }) => {
        const { gridToday, showWeekends } = latest.current;
        const weekend = weekday(day) === 0 || weekday(day) === 6;
        closeOverlay();
        jumpTo(day, gridToday, !showWeekends && weekend);
        if (!eventId) return;
        void window.cal.calendar
          .events(toOffsetIso(fromDayKey(day)), toOffsetIso(fromDayKey(addDays(day, 1))))
          .catch(() => [])
          .then((events) => {
            const event = events.find((each) => each.id === eventId);
            if (!event) return;
            select({ kind: "event", id: event.id });
            openEdit(event, latest.current.zone);
          });
      }),
    [],
  );
}

const SIZE = 512;
// The Dock's icons sit inside a margin, as the app's own does.
const INSET = 52;
const weekdayName = new Intl.DateTimeFormat(undefined, { weekday: "short" });

// Cal's icon as a PNG data URL: `top` small over `main`, or `main` alone, in white.
function drawIcon(main: string, top?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const draw = canvas.getContext("2d");
  if (!draw) return undefined;
  const side = SIZE - INSET * 2;
  draw.fillStyle = "#d97706";
  draw.beginPath();
  draw.roundRect(INSET, INSET, side, side, side * 0.22);
  draw.fill();
  draw.fillStyle = "#ffffff";
  draw.textAlign = "center";
  draw.textBaseline = "alphabetic";
  if (top === undefined) {
    draw.font = "600 204px system-ui";
    draw.fillText(main, SIZE / 2, SIZE / 2 + 72);
  } else {
    draw.font = "600 72px system-ui";
    draw.fillText(top, SIZE / 2, 182);
    draw.font = "600 220px system-ui";
    draw.fillText(main, SIZE / 2, 386);
  }
  return canvas.toDataURL("image/png");
}

/**
 * Keeps today's date on the Dock icon while the setting is on; turning it off puts the
 * plain icon back. Every window has one, so the hidden Quick Entry panel turns the date
 * over at midnight when no other window is open.
 */
export function DockDate() {
  const { dockDate } = useSettings().device;
  const today = useToday();
  const drawn = useRef(false);
  useEffect(() => {
    if (!dockDate && !drawn.current) return;
    const date = fromDayKey(today);
    const icon = dockDate
      ? drawIcon(String(date.getDate()), weekdayName.format(date).toUpperCase())
      : drawIcon("C");
    if (icon) void window.cal.setDockIcon(icon);
    drawn.current = dockDate;
  }, [dockDate, today]);
  return null;
}
