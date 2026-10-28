import { describe, expect, test } from "bun:test";
import { addDays, dayStatuses, type Habit, type HabitEntry, habitStats } from "../src";

const today = "2026-10-28";
const created = new Date(2026, 9, 1).getTime();

const habit = (fields: Partial<Habit> = {}): Habit => ({
  uuid: "h",
  created_at: created,
  updated_at: created,
  title: "Habit",
  kind: "check",
  schedule: "fixed",
  rrule: "FREQ=DAILY",
  display: "strip",
  position: 0,
  ...fields,
});

const entries = (days: string[], value = 1): HabitEntry[] =>
  days.map((date) => ({
    uuid: date,
    created_at: 0,
    updated_at: 0,
    habit_uuid: "h",
    date,
    value,
    source: "manual",
  }));

const lastDays = (count: number, skip: number[] = []) =>
  Array.from({ length: count }, (_, index) => addDays(today, -index)).filter(
    (_, index) => !skip.includes(index),
  );

describe("habitStats", () => {
  test("a daily habit done every day has a full streak and a rising score", () => {
    const stats = habitStats(habit(), entries(lastDays(28)), today);
    expect(stats.streak).toBe(28);
    expect(stats.total).toBe(28);
    expect(stats.score).toBeGreaterThan(0.6);
  });

  test("one missed day doesn't break the streak; two in a row do", () => {
    expect(habitStats(habit(), entries(lastDays(10, [3])), today).streak).toBe(9);
    expect(habitStats(habit(), entries(lastDays(10, [3, 4])), today).streak).toBe(3);
  });

  test("today not done yet is open, not a miss", () => {
    const stats = habitStats(habit(), entries(lastDays(6, [0])), today);
    expect(stats.streak).toBe(5);
  });

  test("a weekly quota covers the rest of the week once met", () => {
    const gym = habit({
      schedule: "quota",
      quota_count: 3,
      quota_period: "week",
      rrule: undefined,
    });
    const statuses = dayStatuses(
      gym,
      entries(["2026-10-26", "2026-10-27", "2026-10-28"]),
      "2026-10-26",
      "2026-10-30",
    );
    expect([...statuses.values()]).toEqual(["done", "done", "done", "covered", "covered"]);
  });

  test("fixed weekdays only count on scheduled days", () => {
    const mwf = habit({ rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
    const statuses = dayStatuses(mwf, entries(["2026-10-26"]), "2026-10-26", "2026-10-28");
    expect([...statuses.values()]).toEqual(["done", "off", "open"]);
  });

  test("unscheduled days don't add strength or forgive misses", () => {
    const mondays = habit({ rrule: "FREQ=WEEKLY;BYDAY=MO" });
    expect(habitStats(mondays, [], today).score).toBe(0);
    // Done Oct 5 and 26, missed the Mondays between: two misses in a row.
    expect(habitStats(mondays, entries(["2026-10-05", "2026-10-26"]), today).streak).toBe(1);
  });

  test("BYDAY limits a daily rule too", () => {
    const mwf = habit({ rrule: "FREQ=DAILY;BYDAY=MO,WE,FR" });
    const statuses = dayStatuses(mwf, [], "2026-10-26", "2026-10-27");
    expect([...statuses.values()]).toEqual(["missed", "off"]);
  });

  test("a measured habit is done only at its target", () => {
    const read = habit({ kind: "measure", target: 20 });
    expect(habitStats(read, entries([today], 10), today).total).toBe(0);
    expect(habitStats(read, entries([today], 25), today).total).toBe(1);
  });
});
