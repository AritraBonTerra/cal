import { describe, expect, test } from "bun:test";
import { nextFreeSlot } from "../src";

const at = (hour: number, minute = 0) => new Date(2026, 9, 28, hour, minute);

describe("nextFreeSlot", () => {
  test("starts at the next snap after now, inside working hours", () => {
    const slot = nextFreeSlot([], at(10, 40), 30);
    expect(slot?.start).toEqual(at(10, 45));
    expect(slot?.end).toEqual(at(11, 15));
    expect(nextFreeSlot([], at(7, 0), 30)?.start).toEqual(at(9, 0));
  });

  test("skips events and blocks already there", () => {
    const busy = [
      { start: at(11, 30), end: at(12, 0) },
      { start: at(10, 45), end: at(11, 30) },
    ];
    const slot = nextFreeSlot(busy, at(10, 40), 45);
    expect(slot?.start).toEqual(at(12, 0));
  });

  test("fits into a gap when it's long enough", () => {
    const busy = [{ start: at(11, 0), end: at(12, 0) }];
    expect(nextFreeSlot(busy, at(10, 0), 60)?.start).toEqual(at(10, 0));
    expect(nextFreeSlot(busy, at(10, 30), 60)?.start).toEqual(at(12, 0));
  });

  test("gives up when the day is full", () => {
    expect(nextFreeSlot([], at(17, 45), 30)).toBeUndefined();
    expect(nextFreeSlot([{ start: at(9), end: at(18) }], at(8), 15)).toBeUndefined();
  });
});

test("finds the free hour after a clash on a DST fall-back day", () => {
  // Nov 1 2026 is 25 hours long in New York, the zone `bun run test` uses here.
  const at = (hour: number) => new Date(2026, 10, 1, hour);
  expect(at(0).getTimezoneOffset()).not.toBe(at(12).getTimezoneOffset());
  const slot = nextFreeSlot([{ start: at(9), end: at(17) }], at(8), 60);
  expect(slot?.start.getHours()).toBe(17);
});
