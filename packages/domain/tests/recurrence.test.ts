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

test("monthly and yearly rules honor INTERVAL, ordinals and month days", () => {
  const at = (month: number, day: number, year = 2027) => new Date(year, month - 1, day, 9);
  const days = (rule: string, start: Date, span = 800) =>
    expandRule(rule, start, new Date(start.getTime() + 3_600_000), span).map(
      (each) => `${each.start.getMonth() + 1}/${each.start.getDate()}`,
    );
  expect(days("FREQ=MONTHLY;INTERVAL=2;COUNT=6", at(1, 15))).toEqual([
    "1/15",
    "3/15",
    "5/15",
    "7/15",
    "9/15",
    "11/15",
  ]);
  expect(days("FREQ=MONTHLY;BYDAY=1FR;COUNT=3", at(1, 1))).toEqual(["1/1", "2/5", "3/5"]);
  expect(days("FREQ=MONTHLY;BYDAY=-1FR;COUNT=2", at(1, 29))).toEqual(["1/29", "2/26"]);
  expect(days("FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3", at(1, 31))).toEqual(["1/31", "2/28", "3/31"]);
  expect(days("FREQ=YEARLY;INTERVAL=2;COUNT=2", at(5, 16), 1500)).toEqual(["5/16", "5/16"]);
});

test("weekly INTERVAL counts weeks from Monday unless WKST says otherwise", () => {
  const start = new Date(2026, 10, 1, 9); // a Sunday
  const days = (rule: string) =>
    expandRule(rule, start, new Date(start.getTime() + 3_600_000), 60).map(
      (each) => `${each.start.getMonth() + 1}/${each.start.getDate()}`,
    );
  expect(days("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SU;COUNT=4")).toEqual([
    "11/1",
    "11/9",
    "11/15",
    "11/23",
  ]);
  expect(days("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SU;WKST=SU;COUNT=4")).toEqual([
    "11/1",
    "11/2",
    "11/15",
    "11/16",
  ]);
});

test("monthly BYSETPOS picks from the month's matching days", () => {
  const start = new Date(2026, 9, 30, 9); // Friday, the last weekday of October
  const days = expandRule(
    "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3",
    start,
    new Date(start.getTime() + 3_600_000),
    120,
  ).map((each) => `${each.start.getMonth() + 1}/${each.start.getDate()}`);
  expect(days).toEqual(["10/30", "11/30", "12/31"]);
});

test("BYMONTH limits a rule to its months", () => {
  const days = (rule: string, start: Date) =>
    expandRule(rule, start, new Date(start.getTime() + 3_600_000), 1200).map(
      (each) => `${each.start.getFullYear()}/${each.start.getMonth() + 1}/${each.start.getDate()}`,
    );
  expect(days("FREQ=MONTHLY;BYMONTH=1;BYMONTHDAY=15;COUNT=3", new Date(2026, 0, 15, 9))).toEqual([
    "2026/1/15",
    "2027/1/15",
    "2028/1/15",
  ]);
  // The fourth Thursday of November, from Thanksgiving 2026.
  expect(days("FREQ=YEARLY;BYMONTH=11;BYDAY=4TH;COUNT=3", new Date(2026, 10, 26, 9))).toEqual([
    "2026/11/26",
    "2027/11/25",
    "2028/11/23",
  ]);
});

test("BYMONTHDAY with BYDAY needs both: Friday the 13th", () => {
  const start = new Date(2026, 10, 13, 9); // Friday, November 13
  const days = expandRule(
    "FREQ=MONTHLY;BYMONTHDAY=13;BYDAY=FR;COUNT=3",
    start,
    new Date(start.getTime() + 3_600_000),
    1200,
  ).map(
    (each) => `${each.start.getFullYear()}/${each.start.getMonth() + 1}/${each.start.getDate()}`,
  );
  expect(days).toEqual(["2026/11/13", "2027/8/13", "2028/10/13"]);
});

test("a daily rule with BYDAY skips the other weekdays", () => {
  const start = new Date(2026, 10, 6, 9); // Friday
  const days = expandRule(
    "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=3",
    start,
    new Date(start.getTime() + 3_600_000),
    30,
  ).map((each) => `${each.start.getMonth() + 1}/${each.start.getDate()}`);
  expect(days).toEqual(["11/6", "11/9", "11/10"]);
});

test("a daily rule with BYMONTHDAY counts only those dates", () => {
  const start = new Date(2026, 10, 15, 9);
  const days = expandRule(
    "FREQ=DAILY;BYMONTHDAY=15;COUNT=3",
    start,
    new Date(start.getTime() + 3_600_000),
    120,
  ).map((each) => `${each.start.getMonth() + 1}/${each.start.getDate()}`);
  expect(days).toEqual(["11/15", "12/15", "1/15"]);
});
