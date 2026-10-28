import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  daysBetween,
  inList,
  logicalToday,
  remainingMinutes,
  startOfWeek,
  type Task,
  type TimeBlock,
  toOffsetIso,
} from "../src";

const task = (fields: Partial<Task> = {}): Task => ({
  uuid: "t",
  created_at: 0,
  updated_at: 0,
  title: "Task",
  position: 0,
  when: "inbox",
  ...fields,
});

describe("dates", () => {
  test("day arithmetic", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetween("2026-10-28", "2026-11-04")).toBe(7);
    expect(startOfWeek("2026-10-28")).toBe("2026-10-26");
    expect(startOfWeek("2026-10-28", 0)).toBe("2026-10-25");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  test("the day starts at the configured hour", () => {
    expect(logicalToday(new Date(2026, 9, 28, 3, 30), 4)).toBe("2026-10-27");
    expect(logicalToday(new Date(2026, 9, 28, 4, 0), 4)).toBe("2026-10-28");
  });

  test("the day boundary is wall-clock time, also on DST change days", () => {
    // In zones with DST these days are 23 and 25 hours long.
    expect(logicalToday(new Date(2026, 2, 8, 4, 30), 4)).toBe("2026-03-08");
    expect(logicalToday(new Date(2026, 10, 1, 3, 30), 4)).toBe("2026-10-31");
  });

  test("offset ISO strings parse back to the same instant", () => {
    const date = new Date(2026, 9, 28, 10, 40);
    expect(Date.parse(toOffsetIso(date))).toBe(date.getTime());
  });
});

describe("smart lists", () => {
  const today = "2026-10-28";

  test("a start date in the past stays in Today and is never overdue", () => {
    const late = task({ when: "date", when_date: "2026-10-20" });
    expect(inList(late, "today", today)).toBe(true);
    expect(inList(late, "upcoming", today)).toBe(false);
  });

  test("future start dates are Upcoming; deadlines pull tasks into Today", () => {
    expect(inList(task({ when: "date", when_date: "2026-11-02" }), "upcoming", today)).toBe(true);
    expect(inList(task({ when: "someday", deadline: today }), "today", today)).toBe(true);
  });

  test("completed tasks only show in the Logbook", () => {
    const done = task({ when: "date", when_date: today, completed_at: 1 });
    expect(inList(done, "today", today)).toBe(false);
    expect(inList(done, "logbook", today)).toBe(true);
  });
});

describe("time blocks", () => {
  test("remaining time counts done and upcoming blocks, not missed ones", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    const block = (start: string, end: string, done?: number): TimeBlock => ({
      uuid: start,
      created_at: 0,
      updated_at: 0,
      task_uuid: "t",
      start_at: start,
      end_at: end,
      time_zone: "UTC",
      source: "manual",
      done_at: done,
    });
    const blocks = [
      block("2026-10-28T08:00:00Z", "2026-10-28T09:00:00Z", 1),
      block("2026-10-28T09:00:00Z", "2026-10-28T09:30:00Z"),
      block("2026-10-28T14:00:00Z", "2026-10-28T14:45:00Z"),
    ];
    expect(remainingMinutes(task({ estimate_min: 180 }), blocks, now)).toBe(75);
    expect(remainingMinutes(task(), blocks, now)).toBeUndefined();
  });
});
