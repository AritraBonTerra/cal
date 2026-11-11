import { describe, expect, test } from "bun:test";
import {
  type Habit,
  type HabitEntry,
  habitDay,
  habitProgress,
  quotaCount,
  scheduledWeekdays,
} from "@cal/domain";
import { activeHabits, emptyHabit, habitRow } from "../src/renderer/src/lib/habits";
import { areaForNewProject } from "../src/renderer/src/lib/lists";

describe("habitRow", () => {
  test("every day is a fixed daily rule shown in the strip", () => {
    expect(habitRow({ ...emptyHabit, title: " Meditate " })).toEqual({
      title: "Meditate",
      display: "strip",
      kind: "check",
      schedule: "fixed",
      rrule: "FREQ=DAILY",
    });
  });

  test("specific weekdays become BYDAY, which the strip reads back", () => {
    const row = habitRow({
      ...emptyHabit,
      title: "Gym",
      schedule: "weekdays",
      weekdays: [5, 1, 3],
    });
    expect(row?.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(
      row && scheduledWeekdays({ ...row, uuid: "", position: 0, created_at: 0, updated_at: 0 }),
    ).toEqual([1, 3, 5]);
    expect(
      habitRow({ ...emptyHabit, title: "Gym", schedule: "weekdays", weekdays: [] }),
    ).toBeNull();
    expect(
      habitRow({
        ...emptyHabit,
        title: "Walk",
        schedule: "weekdays",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      })?.rrule,
    ).toBe("FREQ=DAILY");
  });

  test("quotas and intervals need whole numbers in range", () => {
    expect(habitRow({ ...emptyHabit, title: "Run", schedule: "quota", count: "3" })).toMatchObject({
      schedule: "quota",
      quota_count: 3,
      quota_period: "week",
    });
    expect(habitRow({ ...emptyHabit, title: "Run", schedule: "quota", count: "8" })).toBeNull();
    expect(
      habitRow({ ...emptyHabit, title: "Run", schedule: "quota", count: "8", period: "month" }),
    ).toMatchObject({ quota_count: 8, quota_period: "month" });
    expect(
      habitRow({ ...emptyHabit, title: "Water", schedule: "interval", every: "3" }),
    ).toMatchObject({
      schedule: "interval",
      interval_days: 3,
    });
    expect(
      habitRow({ ...emptyHabit, title: "Water", schedule: "interval", every: "1.5" }),
    ).toBeNull();
  });

  test("times a day is a measure counted in whole times, with no unit", () => {
    const brush = { ...emptyHabit, title: "Brush teeth", track: "times" as const };
    expect(habitRow(brush)).toMatchObject({ kind: "measure", target: 2 });
    expect(habitRow(brush)).not.toHaveProperty("unit");
    // Once a day is plain done-or-not.
    expect(habitRow({ ...brush, times: "1" })).toMatchObject({ kind: "check" });
    expect(habitRow({ ...brush, times: "0" })).toBeNull();
    expect(habitRow({ ...brush, times: "2.5" })).toBeNull();
  });

  test("a measured habit needs a positive target; the unit is optional", () => {
    const read = { ...emptyHabit, title: "Read", track: "amount" as const };
    expect(habitRow(read)).toBeNull();
    expect(habitRow({ ...read, target: "20", unit: "min" })).toMatchObject({
      kind: "measure",
      target: 20,
      unit: "min",
    });
    expect(habitRow({ ...read, target: "5" })).not.toHaveProperty("unit");
    expect(habitRow({ ...read, target: "0" })).toBeNull();
  });

  test("no title, no habit", () => {
    expect(habitRow({ ...emptyHabit, title: "  " })).toBeNull();
  });
});

describe("areaForNewProject", () => {
  const projects = [
    { uuid: "p1", title: "Launch", area_uuid: "work", position: 0, created_at: 0, updated_at: 0 },
    { uuid: "p2", title: "Loose", position: 1, created_at: 0, updated_at: 0 },
  ];
  test("follows the area being shown, or the shown project's area", () => {
    expect(areaForNewProject("area:home", projects)).toBe("home");
    expect(areaForNewProject("project:p1", projects)).toBe("work");
    expect(areaForNewProject("project:p2", projects)).toBeUndefined();
    expect(areaForNewProject("today", projects)).toBeUndefined();
  });
});

// A synced habit row with the fields these tests care about.
const habit = (fields: Partial<Habit> & Pick<Habit, "uuid">): Habit => ({
  title: fields.uuid,
  kind: "check",
  schedule: "fixed",
  display: "strip",
  position: 0,
  created_at: 0,
  updated_at: 0,
  ...fields,
});
const entry = (habit_uuid: string, date: string, value = 1): HabitEntry => ({
  uuid: `${habit_uuid}|${date}`,
  habit_uuid,
  date,
  value,
  source: "manual",
  created_at: 0,
  updated_at: 0,
});

describe("habit progress", () => {
  const read = habit({ uuid: "read", kind: "measure", target: 20, unit: "min" });
  const gym = habit({ uuid: "gym", schedule: "quota", quota_count: 3, quota_period: "week" });
  const swim = habit({ uuid: "swim", schedule: "quota", quota_count: 8, quota_period: "month" });

  const brush = habit({ uuid: "brush", kind: "measure", target: 2 });

  test("a day's value, ring and what a click logs", () => {
    const entries = [entry("read", "2026-10-28", 15)];
    expect(habitDay(read, entries, "2026-10-28")).toEqual({
      value: 15,
      target: 20,
      done: false,
      fraction: 0.75,
      segments: 1,
      next: 20,
      less: 0,
    });
    // A measure with a unit logs its whole target at once, then a click clears the day.
    expect(habitDay(read, [], "2026-10-28")).toMatchObject({ next: 20 });
    expect(habitDay(read, [entry("read", "2026-10-28", 20)], "2026-10-28").next).toBe(0);
    expect(habitDay(gym, entries, "2026-10-28")).toMatchObject({ done: false, next: 1 });
  });

  test("a times-a-day habit goes up one per click, then clears", () => {
    const on = (value: number) =>
      habitDay(brush, value ? [entry("brush", "2026-10-28", value)] : [], "2026-10-28");
    expect(on(0)).toMatchObject({ fraction: 0, segments: 2, next: 1, less: 0 });
    expect(on(1)).toMatchObject({ done: false, fraction: 0.5, next: 2, less: 0 });
    expect(on(2)).toMatchObject({ done: true, fraction: 1, next: 0, less: 1 });
    // Too many times for a split ring: one continuous arc.
    const sips = habit({ uuid: "sips", kind: "measure", target: 12 });
    expect(habitDay(sips, [], "2026-10-28")).toMatchObject({ segments: 1, next: 1 });
    // A target that isn't a whole number can't be split into arcs either.
    const half = habit({ uuid: "half", kind: "measure", target: 2.5 });
    expect(habitDay(half, [], "2026-10-28")).toMatchObject({ segments: 1, next: 1 });
  });

  test("quotas count done days in their Monday week or calendar month", () => {
    // Wed 2026-10-28: its week runs Mon 26 to Sun 1 Nov.
    const entries = [
      entry("gym", "2026-10-25"),
      entry("gym", "2026-10-26"),
      entry("gym", "2026-11-01"),
      entry("swim", "2026-09-30"),
      entry("swim", "2026-10-01"),
      entry("swim", "2026-10-31"),
    ];
    expect(quotaCount(gym, entries, "2026-10-28")).toBe(2);
    expect(quotaCount(swim, entries, "2026-10-28")).toBe(2);
    expect(quotaCount(read, entries, "2026-10-28")).toBeUndefined();
  });

  test("progress names its period: an amount, times today, a quota's week or month", () => {
    const entries = [
      entry("read", "2026-10-28", 15),
      entry("gym", "2026-10-27"),
      entry("brush", "2026-10-28", 1),
    ];
    expect(habitProgress(read, entries, "2026-10-28")).toBe("15/20 min");
    expect(habitProgress(brush, entries, "2026-10-28")).toBe("1/2 today");
    expect(habitProgress(gym, entries, "2026-10-28")).toBe("1/3 this week");
    expect(habitProgress(swim, entries, "2026-10-28")).toBe("0/8 this month");
    expect(habitProgress(habit({ uuid: "meditate" }), entries, "2026-10-28")).toBe("");
    // Twice a day, five days a week: both, shortened.
    const both = { ...brush, schedule: "quota" as const, quota_count: 5 };
    expect(habitProgress(both, entries, "2026-10-28")).toBe("1/2 day · 0/5 wk");
  });

  test("archived habits drop out; the rest keep their order", () => {
    const habits = [
      habit({ uuid: "b", position: 1 }),
      habit({ uuid: "gone", position: 0, archived_at: 5 }),
      habit({ uuid: "a", position: 0 }),
    ];
    expect(activeHabits(habits).map((each) => each.uuid)).toEqual(["a", "b"]);
  });
});
