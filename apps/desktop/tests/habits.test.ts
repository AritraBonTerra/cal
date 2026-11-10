import { describe, expect, test } from "bun:test";
import { type Habit, type HabitEntry, scheduledWeekdays } from "@cal/domain";
import {
  activeHabits,
  emptyHabit,
  habitDay,
  habitProgress,
  habitRow,
  quotaCount,
} from "../src/renderer/src/lib/habits";
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

  test("a measured habit needs a positive target; the unit is optional", () => {
    const read = { ...emptyHabit, title: "Read", measured: true };
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

  test("a day's value, ring and toggle", () => {
    const entries = [entry("read", "2026-10-28", 15)];
    expect(habitDay(read, entries, "2026-10-28")).toEqual({
      value: 15,
      target: 20,
      done: false,
      fraction: 0.75,
      toggle: 0,
    });
    expect(habitDay(gym, entries, "2026-10-28")).toMatchObject({ done: false, toggle: 1 });
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

  test("the sidebar's status: amount for a measure, count for a quota, else nothing", () => {
    const entries = [entry("read", "2026-10-28", 15), entry("gym", "2026-10-27")];
    expect(habitProgress(read, entries, "2026-10-28")).toBe("15/20 min");
    expect(habitProgress({ ...read, unit: undefined }, entries, "2026-10-28")).toBe("15/20");
    expect(habitProgress(gym, entries, "2026-10-28")).toBe("1/3");
    expect(habitProgress(habit({ uuid: "meditate" }), entries, "2026-10-28")).toBe("");
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
