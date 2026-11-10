import { describe, expect, test } from "bun:test";
import { scheduledWeekdays } from "@cal/domain";
import { emptyHabit, habitRow } from "../src/renderer/src/lib/habits";
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
