import { describe, expect, test } from "bun:test";
import { expandRule, ruleCount, withCount } from "../src";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const days = (rule: string, start = at(28, 9, 30), end = at(28, 9, 45), horizon?: number) =>
  expandRule(rule, start, end, horizon).map((each) => each.start.getDate());

describe("expandRule", () => {
  test("daily rules honor INTERVAL, COUNT and UNTIL", () => {
    expect(days("FREQ=DAILY;COUNT=3")).toEqual([28, 29, 30]);
    expect(days("FREQ=DAILY;INTERVAL=2;COUNT=3")).toEqual([28, 30, 1]);
    expect(days("FREQ=DAILY;UNTIL=20261030")).toEqual([28, 29, 30]);
    expect(days("FREQ=DAILY;UNTIL=20261030T235959Z")).toEqual([28, 29, 30]);
    expect(days("FREQ=DAILY;UNTIL=20261030T120000Z")).toEqual([28, 29]);
  });

  test("weekly rules pick BYDAY within the interval's weeks", () => {
    expect(days("FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=4")).toEqual([28, 30, 2, 4]);
    expect(days("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE;COUNT=3")).toEqual([28, 11, 25]);
  });

  test("occurrences keep the start's wall clock and length", () => {
    const [first, second] = expandRule("FREQ=DAILY;COUNT=2", at(31, 9, 30), at(31, 10, 15));
    expect(second?.start.getHours()).toBe(9);
    expect(second?.start.getMinutes()).toBe(30);
    expect(second && second.end.getTime() - second.start.getTime()).toBe(45 * 60_000);
    expect(first?.start.getTime()).toBe(at(31, 9, 30).getTime());
  });

  test("the scan stops at the horizon", () => {
    expect(days("FREQ=DAILY", at(28, 9), at(28, 10), 3)).toEqual([28, 29, 30]);
  });
});

describe("rule counts", () => {
  test("reads and replaces COUNT", () => {
    expect(ruleCount("FREQ=DAILY;COUNT=3")).toBe(3);
    expect(ruleCount("FREQ=DAILY")).toBeUndefined();
    expect(withCount("FREQ=DAILY;COUNT=3;BYDAY=MO", 2)).toBe("FREQ=DAILY;BYDAY=MO;COUNT=2");
    expect(withCount("FREQ=DAILY", 2)).toBe("FREQ=DAILY;COUNT=2");
  });
});
