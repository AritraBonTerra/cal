import { describe, expect, test } from "bun:test";
import type { DeviceCalendar } from "@cal/calendar-source";
import { soloCalendar, visibleEvents } from "../src/renderer/src/lib/calendars";
import { bandRow, markedDays, miniMonthDays } from "../src/renderer/src/lib/miniMonth";

describe("miniMonthDays", () => {
  test("six weeks from the week holding the 1st, on the account's week start", () => {
    const monday = miniMonthDays("2026-10-28", 1);
    expect(monday).toHaveLength(42);
    expect(monday[0]).toBe("2026-09-28");
    expect(miniMonthDays("2026-10-01", 0)[0]).toBe("2026-09-27");
  });
});

describe("markedDays", () => {
  const zone = "America/Los_Angeles";
  test("a timed span marks each day it touches, but not a day it ends at midnight on", () => {
    const days = markedDays(
      [
        { start: "2026-10-28T23:00:00-07:00", end: "2026-10-29T01:00:00-07:00" },
        { start: "2026-10-30T22:00:00-07:00", end: "2026-10-31T00:00:00-07:00" },
      ],
      zone,
    );
    expect([...days].sort()).toEqual(["2026-10-28", "2026-10-29", "2026-10-30"]);
  });

  test("follows the grid's zone for timed spans", () => {
    const days = markedDays(
      [{ start: "2026-10-28T20:00:00-07:00", end: "2026-10-28T21:00:00-07:00" }],
      "Asia/Tokyo",
    );
    expect([...days]).toEqual(["2026-10-29"]);
  });

  test("an all-day event marks its days", () => {
    const days = markedDays(
      [{ start: "2026-10-31T00:00:00-07:00", end: "2026-11-02T00:00:00-08:00", allDay: true }],
      zone,
    );
    expect([...days].sort()).toEqual(["2026-10-31", "2026-11-01"]);
  });
});

describe("bandRow", () => {
  test("rounds each run of visible days at its ends", () => {
    const week = ["a", "b", "c", "d", "e", "f", "g"];
    const band = bandRow(week, new Set(["b", "c", "d", "f"]));
    expect(
      band.map((cell) => `${cell.on ? 1 : 0}${cell.start ? "s" : ""}${cell.end ? "e" : ""}`),
    ).toEqual(["0", "1s", "1", "1e", "0", "1se", "0"]);
  });
});

describe("calendars", () => {
  const calendar = (id: string): DeviceCalendar => ({
    id,
    title: id,
    color: "#3b82f6",
    account: "iCloud",
    writable: true,
  });
  const calendars = ["work", "home", "holidays"].map(calendar);

  test("⌥-click shows only that calendar, and again shows them all", () => {
    expect(soloCalendar(calendars, [], "home")).toEqual(["work", "holidays"]);
    expect(soloCalendar(calendars, ["work", "holidays"], "home")).toEqual([]);
    expect(soloCalendar(calendars, ["work", "holidays"], "work")).toEqual(["home", "holidays"]);
  });

  test("hidden calendars and declined invitations drop out", () => {
    const event = { title: "", start: "", end: "", allDay: false, recurring: false, busy: true };
    const events = [
      { ...event, id: "1", calendarId: "work" },
      { ...event, id: "2", calendarId: "home" },
      { ...event, id: "3", calendarId: "work", myStatus: "declined" as const },
    ];
    expect(visibleEvents(events, ["home"], false).map((each) => each.id)).toEqual(["1"]);
    expect(visibleEvents(events, [], true)).toHaveLength(3);
  });
});
