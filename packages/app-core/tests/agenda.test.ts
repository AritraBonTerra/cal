import { describe, expect, test } from "bun:test";
import type { ExternalEvent } from "@cal/calendar-source";
import {
  fromDayKey,
  type Habit,
  localTimeZone,
  type Task,
  type TimeBlock,
  toOffsetIso,
} from "@cal/domain";
import { type AgendaInput, agendaDays, isEmptyDay } from "../src";

const ZONE = localTimeZone();
const TODAY = "2026-10-28";
const DAYS = ["2026-10-27", TODAY, "2026-10-29", "2026-10-30"];

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
  start: toOffsetIso(new Date(start)),
  end: toOffsetIso(new Date(end)),
  allDay: false,
  recurring: false,
  busy: true,
  ...extra,
});
const task = (title: string, fields: Partial<Task> = {}): Task => ({
  uuid: `task-${next++}`,
  created_at: next,
  updated_at: next,
  title,
  position: next,
  when: "inbox",
  ...fields,
});
const block = (owner: Task, start: string, end: string): TimeBlock => ({
  uuid: `block-${next++}`,
  created_at: next,
  updated_at: next,
  task_uuid: owner.uuid,
  start_at: toOffsetIso(new Date(start)),
  end_at: toOffsetIso(new Date(end)),
  source: "manual",
  time_zone: ZONE,
});
const habit = (title: string, fields: Partial<Habit> = {}): Habit => ({
  uuid: `habit-${next++}`,
  created_at: next,
  updated_at: next,
  title,
  position: next,
  schedule: "fixed",
  kind: "check",
  display: "strip",
  ...fields,
});

// The agenda of DAYS as titles per day.
function titles(input: Partial<AgendaInput>) {
  const days = agendaDays(DAYS, {
    events: [],
    blocks: [],
    tasks: [],
    projects: [],
    habits: [],
    entries: [],
    gridToday: TODAY,
    today: TODAY,
    zone: ZONE,
    ...input,
  });
  return Object.fromEntries(
    days.map((day) => [
      day.day.slice(8),
      {
        allDay: day.allDay.map((each) => each.title),
        tasks: day.tasks.map((each) => each.title),
        due: day.due.map((each) => each.title),
        habits: day.habits.map((each) => each.title),
        timed: day.timed.map((each) =>
          each.kind === "event" ? each.event.title : (each.task?.title ?? "block"),
        ),
        empty: isEmptyDay(day),
      },
    ]),
  );
}

describe("agendaDays", () => {
  test("mixes events and blocks in time order, whatever order they come in", () => {
    const spec = task("Write spec", { when: "date", when_date: TODAY });
    const days = titles({
      events: [
        event("Review", "2026-10-28T14:00", "2026-10-28T15:00"),
        event("Standup", "2026-10-28T09:30", "2026-10-28T09:45"),
      ],
      tasks: [spec],
      blocks: [block(spec, "2026-10-28T11:00", "2026-10-28T12:00")],
    });
    expect(days["28"]?.timed).toEqual(["Standup", "Write spec", "Review"]);
    // A to-do with a block that day isn't listed a second time.
    expect(days["28"]?.tasks).toEqual([]);
  });

  test("puts an event crossing midnight on both days, and one ending at midnight on one", () => {
    const days = titles({
      events: [
        event("Flight", "2026-10-28T22:00", "2026-10-29T02:00"),
        event("Party", "2026-10-29T20:00", "2026-10-30T00:00"),
      ],
    });
    expect(days["28"]?.timed).toEqual(["Flight"]);
    expect(days["29"]?.timed).toEqual(["Flight", "Party"]);
    expect(days["30"]?.timed).toEqual([]);
  });

  test("shows an all-day event on each of its days, the end exclusive", () => {
    const trip = event("Trip", "2026-10-28", "2026-10-30", {
      allDay: true,
      start: toOffsetIso(fromDayKey("2026-10-28")),
      end: toOffsetIso(fromDayKey("2026-10-30")),
    });
    const days = titles({ events: [trip] });
    expect(
      Object.entries(days)
        .filter(([, day]) => day.allDay.length)
        .map(([key]) => key),
    ).toEqual(["28", "29"]);
  });

  test("rolls past to-dos into today, and leaves done ones out", () => {
    const days = titles({
      tasks: [
        task("Late", { when: "date", when_date: "2026-10-27" }),
        task("Thursday", { when: "date", when_date: "2026-10-29" }),
        task("Done", { when: "date", when_date: TODAY, completed_at: 1 }),
        task("Someday", { when: "someday" }),
      ],
    });
    expect(days["27"]?.tasks).toEqual([]);
    expect(days["28"]?.tasks).toEqual(["Late"]);
    expect(days["29"]?.tasks).toEqual(["Thursday"]);
  });

  test("lists a deadline on its day, once", () => {
    const days = titles({
      tasks: [
        task("Invoice", { when: "date", when_date: TODAY, deadline: "2026-10-30" }),
        task("Same day", { when: "date", when_date: "2026-10-30", deadline: "2026-10-30" }),
      ],
    });
    expect(days["28"]?.tasks).toEqual(["Invoice"]);
    expect(days["30"]).toMatchObject({ tasks: ["Same day"], due: ["Invoice"] });
  });

  test("a passed deadline shows in today alone", () => {
    const days = titles({ tasks: [task("Pay rent", { deadline: "2026-10-27" })] });
    expect(days["27"]?.due).toEqual([]);
    expect(days["28"]?.tasks).toEqual(["Pay rent"]);
  });

  test("shows today's habits only, without ones that are off today or archived", () => {
    const days = titles({
      habits: [
        habit("Meditate", { rrule: "FREQ=DAILY" }),
        // Wednesday the 28th isn't one of its days.
        habit("Gym", { rrule: "FREQ=WEEKLY;BYDAY=TU,TH" }),
        habit("Old", { rrule: "FREQ=DAILY", archived_at: 1 }),
      ],
    });
    expect(days["28"]?.habits).toEqual(["Meditate"]);
    expect(days["29"]?.habits).toEqual([]);
  });

  test("cuts days at midnight in the zone shown, not the device's", () => {
    // 23:30 Wednesday in UTC is Thursday morning in Tokyo.
    const late = event("Late call", "2026-10-28T23:30Z", "2026-10-28T23:45Z");
    const days = titles({ events: [late], zone: "Asia/Tokyo" });
    expect(days["28"]?.timed).toEqual([]);
    expect(days["29"]?.timed).toEqual(["Late call"]);
  });

  test("a day with nothing on it is empty", () => {
    expect(titles({})["30"]?.empty).toBe(true);
    expect(titles({ tasks: [task("Due", { deadline: "2026-10-30" })] })["30"]?.empty).toBe(false);
  });
});
