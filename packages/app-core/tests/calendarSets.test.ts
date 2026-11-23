import { describe, expect, test } from "bun:test";
import { activeSet, type CalendarSet, hiddenWith } from "../src";

const work: CalendarSet = {
  id: "work",
  name: "Work",
  calendars: ["w1", "w2"],
  hours: { days: [1, 2, 3, 4, 5], start: 9 * 60, end: 18 * 60 },
};
const home: CalendarSet = { id: "home", name: "Home", calendars: ["h1"] };
const sets = [work, home];
// Wednesday and Saturday.
const at = (day: number, hour: number) => new Date(2026, 9, day, hour);

describe("activeSet", () => {
  test("Automatic follows each set's days and hours, the end excluded", () => {
    expect(activeSet(sets, "auto", at(28, 9))?.id).toBe("work");
    expect(activeSet(sets, "auto", at(28, 18))).toBeUndefined();
    expect(activeSet(sets, "auto", at(28, 8))).toBeUndefined();
    expect(activeSet(sets, "auto", at(31, 12))).toBeUndefined();
  });

  test("a chosen set holds at any hour, All shows everything, a deleted set nothing special", () => {
    expect(activeSet(sets, "home", at(28, 12))?.id).toBe("home");
    expect(activeSet(sets, "all", at(28, 12))).toBeUndefined();
    expect(activeSet(sets, "gone", at(28, 12))).toBeUndefined();
  });
});

test("a set hides the calendars outside it, on top of those hidden by hand", () => {
  const calendars = ["w1", "w2", "h1"].map((id) => ({ id }));
  expect(hiddenWith(work, calendars, ["w2"])).toEqual(["w2", "h1"]);
  expect(hiddenWith(undefined, calendars, ["w2"])).toEqual(["w2"]);
});
