import { describe, expect, test } from "bun:test";
import type { ExternalEvent } from "@cal/calendar-source";
import { eventsOnDay, visibleEvents } from "../src/renderer/src/lib/calendars";

const event = (id: string, start: string, end: string, extra: Partial<ExternalEvent> = {}) => ({
  id,
  calendarId: "work",
  title: id,
  start,
  end,
  allDay: false,
  recurring: false,
  busy: true,
  ...extra,
});

describe("visibleEvents", () => {
  const events = [
    event("shown", "2026-10-29T09:00:00-07:00", "2026-10-29T10:00:00-07:00"),
    event("hidden", "2026-10-29T09:00:00-07:00", "2026-10-29T10:00:00-07:00", {
      calendarId: "personal",
    }),
    event("declined", "2026-10-29T09:00:00-07:00", "2026-10-29T10:00:00-07:00", {
      myStatus: "declined",
    }),
  ];

  test("drops hidden calendars and declined invitations", () => {
    expect(visibleEvents(events, ["personal"], false).map((each) => each.id)).toEqual(["shown"]);
  });

  test("keeps declined ones when they're turned on", () => {
    expect(visibleEvents(events, [], true)).toHaveLength(3);
  });
});

describe("eventsOnDay", () => {
  test("lists events overlapping the day, all-day first, then by start", () => {
    const events = [
      event("late", "2026-10-29T15:00:00-07:00", "2026-10-29T16:00:00-07:00"),
      event("early", "2026-10-29T08:00:00-07:00", "2026-10-29T09:00:00-07:00"),
      event("all day", "2026-10-29T00:00:00-07:00", "2026-10-30T00:00:00-07:00", { allDay: true }),
      event("overnight", "2026-10-28T23:00:00-07:00", "2026-10-29T01:00:00-07:00"),
      event("next day", "2026-10-30T00:00:00-07:00", "2026-10-30T01:00:00-07:00"),
    ];
    expect(eventsOnDay(events, "2026-10-29").map((each) => each.id)).toEqual([
      "all day",
      "overnight",
      "early",
      "late",
    ]);
  });
});
