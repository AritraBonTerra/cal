import { describe, expect, test } from "bun:test";
import type { ExternalEvent } from "@cal/calendar-source";
import { type DayKey, type Project, type Task, type TimeBlock, toOffsetIso } from "@cal/domain";
import {
  deadlinesByDay,
  listShowing,
  overMinutes,
  plannedMinutes,
  unscheduledByDay,
  type WorkloadInput,
  workloadDetail,
  workloadLabel,
  workloadOn,
} from "../src/renderer/src/components/grid/agenda";

/*
 * What the day headers report per day: unscheduled to-dos, deadlines and workload. The
 * suite runs in Los Angeles (see package.json); the fixture week is Mon 26 Oct – Sun 1
 * Nov 2026 with today on Wednesday the 28th.
 */
const LA = "America/Los_Angeles";
const TODAY = "2026-10-28";
const WEEK = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];

let next = 0;
const task = (title: string, fields: Partial<Task> = {}): Task => ({
  uuid: `task-${next++}`,
  created_at: next,
  updated_at: next,
  title,
  position: 0,
  when: "inbox",
  ...fields,
});
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const block = (taskUuid: string, start: Date, end: Date, fields: Partial<TimeBlock> = {}) => ({
  uuid: `block-${next++}`,
  created_at: next,
  updated_at: next,
  task_uuid: taskUuid,
  start_at: toOffsetIso(start),
  end_at: toOffsetIso(end),
  time_zone: LA,
  source: "manual" as const,
  ...fields,
});
const event = (start: Date, end: Date, fields: Partial<ExternalEvent> = {}): ExternalEvent => ({
  id: `event-${next++}`,
  calendarId: "work",
  title: "Meeting",
  start: toOffsetIso(start),
  end: toOffsetIso(end),
  allDay: false,
  recurring: false,
  busy: true,
  ...fields,
});
const titles = (map: Map<DayKey, Task[]>, day: DayKey) => map.get(day)?.map((each) => each.title);

describe("unscheduledByDay", () => {
  const overdue = task("Pay rent", { when: "date", when_date: "2026-10-26" });
  const today = task("Review PR", { when: "date", when_date: TODAY, position: 1 });
  const evening = task("Call movers", { when: "evening", when_date: TODAY });
  const blocked = task("Write spec", { when: "date", when_date: TODAY });
  const thursday = task("Board deck", { when: "date", when_date: "2026-10-29" });
  // Dated Friday, but its deadline today pulls it into Today.
  const dueToday = task("Expenses", { when: "date", when_date: "2026-10-30", deadline: TODAY });
  const done = task("Done thing", { when: "date", when_date: "2026-10-29", completed_at: 1 });
  const tasks = [overdue, today, evening, blocked, thursday, dueToday, done];
  const blocks = [block(blocked.uuid, at(28, 14), at(28, 15))];

  test("today's column is the Today list, minus to-dos with a block today", () => {
    const byDay = unscheduledByDay(WEEK, tasks, blocks, TODAY, LA);
    expect(titles(byDay, TODAY)).toEqual(["Pay rent", "Expenses", "Review PR", "Call movers"]);
  });

  test("later days hold their dated open to-dos that aren't already in Today", () => {
    const byDay = unscheduledByDay(WEEK, tasks, blocks, TODAY, LA);
    expect(titles(byDay, "2026-10-29")).toEqual(["Board deck"]);
    expect(titles(byDay, "2026-10-30")).toEqual([]);
  });

  test("past days hold nothing: their to-dos rolled into Today", () => {
    const byDay = unscheduledByDay(WEEK, tasks, blocks, TODAY, LA);
    expect(titles(byDay, "2026-10-26")).toEqual([]);
  });

  test("travelling, days and today are the grid's: the LA 2 PM block is Thursday in Tokyo", () => {
    const byDay = unscheduledByDay(WEEK, tasks, blocks, "2026-10-29", "Asia/Tokyo");
    expect(titles(byDay, "2026-10-29")).not.toContain("Write spec");
    expect(titles(byDay, "2026-10-29")).toContain("Board deck");
    expect(titles(byDay, TODAY)).toEqual([]);
  });
});

describe("deadlinesByDay", () => {
  test("lists open to-dos and open projects due that day", () => {
    const due = task("Ship", { deadline: "2026-10-30" });
    const closed = task("Shipped", { deadline: "2026-10-30", canceled_at: 1 });
    const project = (title: string, fields: Partial<Project> = {}): Project => ({
      uuid: `project-${next++}`,
      created_at: next,
      updated_at: next,
      title,
      position: 0,
      deadline: "2026-10-30",
      ...fields,
    });
    const byDay = deadlinesByDay(
      WEEK,
      [due, closed],
      [project("Launch"), project("Old", { completed_at: 1 })],
    );
    expect(byDay.get("2026-10-30")?.tasks.map((each) => each.title)).toEqual(["Ship"]);
    expect(byDay.get("2026-10-30")?.projects.map((each) => each.title)).toEqual(["Launch"]);
    expect(byDay.get("2026-10-29")).toEqual({ tasks: [], projects: [] });
  });
});

describe("listShowing", () => {
  const thursday = task("Board deck", { when: "date", when_date: "2026-10-29", project_uuid: "p" });
  test("keeps the current list when it holds the to-do", () => {
    expect(listShowing(thursday, "project:p", [thursday], TODAY)).toBe("project:p");
  });
  test("otherwise picks the smart list holding it", () => {
    expect(listShowing(thursday, "today", [thursday], TODAY)).toBe("upcoming");
    const inbox = task("Loose end");
    expect(listShowing(inbox, "today", [inbox], TODAY)).toBe("inbox");
  });
});

describe("workloadOn", () => {
  const spec = task("Write spec", { when: "date", when_date: TODAY, estimate_min: 180 });
  const review = task("Review PR", { when: "date", when_date: TODAY, estimate_min: 45 });
  const closed = task("Old", { completed_at: 1 });
  const input = (fields: Partial<WorkloadInput> = {}): WorkloadInput => ({
    events: [
      // 8:30–9:30 counts only from 9:00; 11–12 and 11:30–12:30 merge into 1h30.
      event(at(28, 8, 30), at(28, 9, 30)),
      event(at(28, 11), at(28, 12)),
      event(at(28, 11, 30), at(28, 12, 30)),
      event(at(28, 13), at(28, 14), { myStatus: "declined" }),
      event(at(28, 15), at(28, 16), { busy: false }),
      event(at(28, 16), at(28, 17), { calendarId: "free" }),
      event(at(28, 0), at(29, 0), { allDay: true }),
    ],
    blocks: [
      block(spec.uuid, at(28, 14), at(28, 15, 30)),
      block(spec.uuid, at(28, 9), at(28, 10), { done_at: 1 }),
      block(closed.uuid, at(28, 16), at(28, 17)),
    ],
    tasks: [spec, review, closed],
    unscheduled: [review],
    hours: { start: 9 * 60, end: 18 * 60 },
    freeCalendars: ["free"],
    zone: LA,
    now: at(28, 10, 40),
    ...fields,
  });

  test("meetings merge overlaps inside working hours and skip declined and free time", () => {
    expect(workloadOn(TODAY, input()).meetings).toBe(120);
  });

  test("planned is not-done blocks of open to-dos plus the unscheduled estimates", () => {
    const load = workloadOn(TODAY, input());
    expect(load.blocks).toBe(90);
    expect(load.todos).toBe(45);
    expect(plannedMinutes(load)).toBe(135);
    expect(load.capacity).toBe(540);
    expect(workloadLabel(load)).toBe("2h meetings · 2h15 planned");
    expect(workloadLabel(load, true)).toBe("2h · 2h15");
  });

  test("past capacity it reads as over", () => {
    const load = workloadOn(TODAY, input({ hours: { start: 11 * 60, end: 14 * 60 } }));
    // Meetings 11:00–12:30 inside 11–14, plus 2h15 planned, against 3h.
    expect(overMinutes(load)).toBe(45);
    expect(workloadLabel(load)).toBe("over by 45m");
    expect(workloadDetail(load)).toContain("Over by 45m");
  });

  test("a weekend has no capacity and never reads as over", () => {
    const saturday = task("Pack", { when: "date", when_date: "2026-10-31", estimate_min: 90 });
    const load = workloadOn(
      "2026-10-31",
      input({ events: [event(at(31, 10), at(31, 11))], unscheduled: [saturday], blocks: [] }),
    );
    expect(load).toEqual({ meetings: 0, blocks: 0, todos: 90, capacity: 0 });
    expect(overMinutes(load)).toBe(0);
    expect(workloadLabel(load)).toBe("1h30 planned");
    expect(workloadDetail(load)).toContain("No working hours");
  });
});
