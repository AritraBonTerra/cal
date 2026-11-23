import { describe, expect, test } from "bun:test";
import type { ExternalEvent } from "@cal/calendar-source";
import type { Task } from "@cal/domain";
import {
  callKey,
  type DeskData,
  menuBarTitle,
  menuModel,
  morningSummary,
  shownEvents,
  startingCalls,
  summaryDue,
} from "../src/main/upcoming";
import type { DeskPrefs } from "../src/shared/api";

// The suite runs in Los Angeles; "now" is Wednesday the 28th, 10:40.
const at = (time: string, day = "28") => new Date(`2026-10-${day}T${time}:00-07:00`);
const NOW = at("10:40");

let next = 0;
const event = (
  title: string,
  start: string,
  end: string,
  extra: Partial<ExternalEvent> = {},
): ExternalEvent => ({
  id: `event-${next++}`,
  calendarId: "work",
  title,
  start: `2026-10-28T${start}:00-07:00`,
  end: `2026-10-28T${end}:00-07:00`,
  allDay: false,
  recurring: false,
  busy: true,
  ...extra,
});
const ZOOM = { url: "https://zoom.us/j/81234567890" };
const task = (title: string, fields: Partial<Task> = {}): Task => ({
  uuid: `task-${next++}`,
  created_at: 1,
  updated_at: 1,
  title,
  position: next,
  when: "date",
  when_date: "2026-10-28",
  ...fields,
});
const desk = (data: Partial<DeskData>): DeskData => ({
  events: [],
  tasks: [],
  blocks: [],
  projects: [],
  habits: [],
  entries: [],
  ...data,
});

describe("menu bar title", () => {
  const title = (...events: ExternalEvent[]) => menuBarTitle(events, NOW, true);

  test("counts down to the next event in its last hour, else gives its time", () => {
    expect(title(event("Review", "10:45", "11:00"))).toBe("Review in 5m");
    expect(title(event("Review", "11:40", "12:00"))).toBe("Review in 1h");
    expect(title(event("Review", "14:30", "15:00"))).toBe("Review 2:30 PM");
    expect(menuBarTitle([event("Review", "14:30", "15:00")], NOW, false)).toBe("Review 14:30");
  });

  test("shows what's left of the event on now, unless another is about to start", () => {
    const running = event("Planning", "10:00", "11:10");
    expect(title(running, event("Later", "14:00", "15:00"))).toBe("Planning · 30m left");
    expect(title(running, event("Soon", "10:50", "11:00"))).toBe("Soon in 10m");
  });

  test("is empty once today is over, and skips all-day and declined events", () => {
    expect(title(event("Early", "09:00", "10:00"))).toBe("");
    expect(
      title(
        event("Holiday", "00:00", "23:59", { allDay: true }),
        event("No", "11:00", "12:00", { myStatus: "declined" }),
      ),
    ).toBe("");
    const tomorrow = event("Tomorrow", "09:00", "10:00", {
      start: "2026-10-29T09:00:00-07:00",
      end: "2026-10-29T10:00:00-07:00",
    });
    expect(title(tomorrow)).toBe("");
  });

  test("cuts long titles short", () => {
    expect(title(event("A very long meeting title that goes on", "10:45", "11:00"))).toBe(
      "A very long meeting title t… in 5m",
    );
  });
});

test("the menu offers today's call and lists what's still to come", () => {
  const call = event("Standup", "10:45", "11:00", ZOOM);
  const model = menuModel(
    desk({ events: [event("Over", "09:00", "10:00"), call, event("Lunch", "12:00", "13:00")] }),
    NOW,
    true,
  );
  expect(model.join).toEqual({ label: "Join Standup (Zoom)", url: ZOOM.url });
  expect(model.rows.map((row) => row.label)).toEqual(["10:45 AM   Standup", "12 PM   Lunch"]);
  expect(model.rows[0]?.eventId).toBe(call.id);
  const tomorrow = event("Tomorrow", "09:00", "10:00", {
    ...ZOOM,
    start: "2026-10-29T09:00:00-07:00",
    end: "2026-10-29T10:00:00-07:00",
  });
  expect(menuModel(desk({ events: [tomorrow] }), NOW, true).join).toBeUndefined();
});

test("a call is announced once, a minute before, and again if it moves", () => {
  const call = event("Standup", "10:41", "11:00", ZOOM);
  expect(startingCalls([call], NOW, new Set())).toEqual([call]);
  expect(startingCalls([call], at("10:39"), new Set())).toEqual([]);
  expect(startingCalls([call], NOW, new Set([callKey(call)]))).toEqual([]);
  const moved = { ...call, start: "2026-10-28T10:40:30-07:00" };
  expect(startingCalls([moved], NOW, new Set([callKey(call)]))).toEqual([moved]);
  // A Mac asleep at the start still hears of a call that's on, for a few minutes.
  expect(startingCalls([call], at("10:45"), new Set())).toEqual([call]);
  expect(startingCalls([call], at("10:46"), new Set())).toEqual([]);
  const brief = { ...call, end: "2026-10-28T10:43:00-07:00" };
  expect(startingCalls([brief], at("10:44"), new Set())).toEqual([]);
  expect(startingCalls([event("No call", "10:41", "11:00")], NOW, new Set())).toEqual([]);
  expect(startingCalls([{ ...call, myStatus: "declined" }], NOW, new Set())).toEqual([]);
});

test("hidden calendars and declined events stay out", () => {
  const prefs: DeskPrefs = {
    hiddenCalendars: ["family"],
    calendarSets: [
      {
        id: "s",
        name: "Home",
        calendars: ["home", "family"],
        hours: { days: [3], start: 18 * 60, end: 22 * 60 },
      },
    ],
    calendarSet: "auto",
    showDeclined: false,
    hour12: true,
    menuBar: true,
    callNotices: true,
    morningSummary: null,
  };
  const events = [
    event("Work", "11:00", "12:00"),
    event("Hidden", "11:00", "12:00", { calendarId: "family" }),
    event("No", "11:00", "12:00", { myStatus: "declined" }),
  ];
  expect(shownEvents(events, prefs, NOW).map((each) => each.title)).toEqual(["Work"]);
  // Its hours come round with no window open: the set takes over by itself.
  const home = event("Home", "19:00", "20:00", { calendarId: "home" });
  expect(shownEvents([...events, home], prefs, at("19:00"))).toEqual([home]);
});

describe("morning summary", () => {
  test("comes once, at its time or up to four hours late", () => {
    const eight = 8 * 60;
    expect(summaryDue(eight, at("07:59"), undefined)).toBe(false);
    expect(summaryDue(eight, at("08:00"), "2026-10-27")).toBe(true);
    expect(summaryDue(eight, at("08:01"), "2026-10-28")).toBe(false);
    expect(summaryDue(eight, at("11:59"), undefined)).toBe(true);
    expect(summaryDue(eight, at("12:00"), undefined)).toBe(false);
    expect(summaryDue(null, at("08:00"), undefined)).toBe(false);
  });

  test("counts the day and names the first event", () => {
    const { title, body } = morningSummary(
      desk({
        events: [event("Standup", "09:30", "09:45"), event("Review", "14:00", "15:00")],
        tasks: [task("Pay rent")],
      }),
      at("08:00"),
      true,
    );
    expect(title).toContain("October 28");
    expect(body).toBe("2 events, first Standup at 9:30 AM · 1 to-do");
    expect(morningSummary(desk({}), at("08:00"), true).body).toBe("Nothing planned today");
  });
});
