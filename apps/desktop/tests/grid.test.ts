import { describe, expect, test } from "bun:test";
import {
  barColumns,
  dragged,
  dragSpan,
  withinDays,
} from "../src/renderer/src/components/grid/model";

/*
 * Pure grid math behind the pointer gestures. Dates are local, built the way the grid
 * builds them, so the checks hold in any zone.
 */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

describe("dragSpan", () => {
  test("keeps the anchor day when the pointer crosses into the next day", () => {
    // Wed 15:00 → Thu 16:00 used to collapse onto Thursday.
    expect(dragSpan(at(28, 15), at(29, 16))).toEqual({ start: at(28, 15), end: at(29, 16) });
  });

  test("orders the ends when dragging upward, and is never shorter than one step", () => {
    expect(dragSpan(at(28, 15), at(28, 14))).toEqual({ start: at(28, 14), end: at(28, 15, 15) });
    expect(dragSpan(at(28, 15), at(28, 15))).toEqual({ start: at(28, 15), end: at(28, 15, 15) });
  });
});

describe("dragged", () => {
  const overnight = { start: at(28, 23), end: at(29, 1) };

  test("resizes the end of an item that crosses midnight as an instant", () => {
    // The end edge sits on Thursday; a 15-minute pull used to jump it to 23:15 that night.
    expect(dragged(overnight, "end", 0, 15, 15)).toEqual({ start: at(28, 23), end: at(29, 1, 15) });
  });

  test("keeps a minimum duration across midnight", () => {
    expect(dragged(overnight, "end", 0, -150, 15)).toEqual({
      start: at(28, 23),
      end: at(28, 23, 15),
    });
    expect(dragged(overnight, "start", 1, 60, 15)).toEqual({
      start: at(29, 0, 45),
      end: at(29, 1),
    });
  });

  test("moves by day and minute deltas, keeping the length", () => {
    expect(dragged(overnight, "move", 1, -30, 15)).toEqual({
      start: at(29, 22, 30),
      end: at(30, 0, 30),
    });
  });

  test("follows a pointer that crosses midnight the other way", () => {
    // Pressed on the Thursday segment at 00:30, released on Wednesday at 23:30.
    expect(dragged(overnight, "end", -1, 1380, 15)).toEqual({
      start: at(28, 23),
      end: at(29, 0, 0),
    });
  });
});

describe("withinDays", () => {
  const block = { start: at(28, 23), end: at(29, 1) };

  test("includes a block on every day it touches", () => {
    expect(withinDays(block, "2026-10-28", "2026-10-28")).toBe(true);
    expect(withinDays(block, "2026-10-29", "2026-10-29")).toBe(true);
    expect(withinDays(block, "2026-10-30", "2026-10-30")).toBe(false);
  });

  test("a block ending at midnight belongs to the day before only", () => {
    expect(withinDays({ start: at(28, 23), end: at(29, 0) }, "2026-10-29", "2026-10-29")).toBe(
      false,
    );
  });

  test("takes the day boundaries from the grid's zone", () => {
    // 09:00–10:00 Tokyo on the 30th is 00:00–01:00 UTC that day; the block sits on the
    // 30th in Tokyo and on the 29th in Los Angeles.
    const tokyo = {
      start: new Date("2026-10-30T00:00:00Z"),
      end: new Date("2026-10-30T01:00:00Z"),
    };
    expect(withinDays(tokyo, "2026-10-30", "2026-10-30", "Asia/Tokyo")).toBe(true);
    expect(withinDays(tokyo, "2026-10-29", "2026-10-29", "Asia/Tokyo")).toBe(false);
    expect(withinDays(tokyo, "2026-10-29", "2026-10-29", "America/Los_Angeles")).toBe(true);
    expect(withinDays(tokyo, "2026-10-30", "2026-10-30", "America/Los_Angeles")).toBe(false);
  });
});

describe("barColumns", () => {
  // Two weeks with weekends hidden.
  const weekdays = [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-11-02",
    "2026-11-03",
    "2026-11-04",
    "2026-11-05",
    "2026-11-06",
  ];

  test("a bar over a hidden weekend starts on the next visible day", () => {
    // Sat Oct 31 → Mon Nov 2 shows on Monday only, not from Friday.
    expect(barColumns(weekdays, "2026-10-31", "2026-11-02")).toEqual({ from: 5, to: 5 });
    // Fri → Sat ends on Friday.
    expect(barColumns(weekdays, "2026-10-30", "2026-10-31")).toEqual({ from: 4, to: 4 });
  });

  test("a bar that lies entirely in hidden days is not drawn", () => {
    expect(barColumns(weekdays, "2026-10-31", "2026-11-01")).toBeUndefined();
  });

  test("a bar past either edge is clipped to the visible days", () => {
    expect(barColumns(weekdays, "2026-10-20", "2026-10-27")).toEqual({ from: 0, to: 1 });
    expect(barColumns(weekdays, "2026-11-05", "2026-11-20")).toEqual({ from: 8, to: 9 });
    expect(barColumns(weekdays, "2026-11-09", "2026-11-10")).toBeUndefined();
  });
});
