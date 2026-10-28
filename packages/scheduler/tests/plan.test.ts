import { describe, expect, test } from "bun:test";
import { type PlanInput, plan, subtract } from "../src";

// Wednesday 2026-10-28 08:00 local; working hours 9–17 on weekdays.
const now = new Date(2026, 9, 28, 8, 0);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();
const weekdays = Object.fromEntries(
  [1, 2, 3, 4, 5].map((weekday) => [weekday, [{ startMin: 9 * 60, endMin: 17 * 60 }]]),
);

const input = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  now,
  horizonDays: 7,
  workingHours: weekdays,
  busy: [],
  work: [],
  frozenMin: 0,
  ...overrides,
});

const times = (result: ReturnType<typeof plan>) =>
  result.placements.map((placement) => [
    placement.id,
    new Date(placement.start).toTimeString().slice(0, 5),
    new Date(placement.end).toTimeString().slice(0, 5),
    new Date(placement.start).getDate(),
  ]);

describe("plan", () => {
  test("places work in the earliest free working time, around busy events", () => {
    const result = plan(
      input({
        busy: [{ start: at(28, 9), end: at(28, 10) }],
        work: [{ id: "a", title: "A", remainingMin: 60 }],
      }),
    );
    expect(times(result)).toEqual([["a", "10:00", "11:00", 28]]);
    expect(result.placements[0]?.reason).toContain("Earliest free slot");
  });

  test("splits long work into chunks of at most maxChunk", () => {
    const result = plan(
      input({ work: [{ id: "a", title: "A", remainingMin: 300, maxChunkMin: 120 }] }),
    );
    expect(times(result)).toEqual([
      ["a", "09:00", "11:00", 28],
      ["a", "11:00", "13:00", 28],
      ["a", "13:00", "14:00", 28],
    ]);
  });

  test("tighter deadlines go first", () => {
    const result = plan(
      input({
        workingHours: {
          3: [{ startMin: 9 * 60, endMin: 11 * 60 }],
          4: [{ startMin: 9 * 60, endMin: 11 * 60 }],
        },
        work: [
          { id: "later", title: "Later", remainingMin: 120, deadline: "2026-10-29" },
          { id: "soon", title: "Soon", remainingMin: 120, deadline: "2026-10-28" },
        ],
      }),
    );
    expect(times(result)).toEqual([
      ["soon", "09:00", "11:00", 28],
      ["later", "09:00", "11:00", 29],
    ]);
  });

  test("respects start days and reports what can't fit", () => {
    const result = plan(
      input({
        horizonDays: 2,
        work: [
          { id: "a", title: "A", remainingMin: 60, startDay: "2026-10-29" },
          { id: "b", title: "B", remainingMin: 20 * 60 },
        ],
      }),
    );
    expect(result.placements.find((each) => each.id === "a")?.start).toBe(at(29, 9));
    expect(result.unplaced).toEqual([
      { id: "b", remainingMin: 20 * 60 - 15 * 60, reason: "No free time in the next 2 days" },
    ]);
  });

  test("keeps the previous plan when it still fits", () => {
    const previous = [{ id: "a", start: at(28, 14), end: at(28, 15), reason: "" }];
    const result = plan(input({ previous, work: [{ id: "a", title: "A", remainingMin: 60 }] }));
    expect(times(result)).toEqual([["a", "14:00", "15:00", 28]]);
    expect(result.placements[0]?.reason).toContain("Kept from the last plan");
  });

  test("nothing in the frozen window moves, and new work starts after it", () => {
    const later = new Date(2026, 9, 28, 9, 30);
    const previous = [{ id: "a", start: at(28, 10), end: at(28, 11), reason: "kept" }];
    const result = plan(
      input({
        now: later,
        frozenMin: 90,
        previous,
        busy: [],
        work: [
          { id: "a", title: "A", remainingMin: 60 },
          { id: "b", title: "B", remainingMin: 30 },
        ],
      }),
    );
    expect(times(result)).toEqual([
      ["a", "10:00", "11:00", 28],
      ["b", "11:00", "11:30", 28],
    ]);
  });

  test("the same inputs give the same plan", () => {
    const work = [
      { id: "x", title: "X", remainingMin: 90, priority: 2 },
      { id: "y", title: "Y", remainingMin: 45, priority: 1 },
      { id: "z", title: "Z", remainingMin: 200, deadline: "2026-10-30" },
    ];
    expect(plan(input({ work }))).toEqual(plan(input({ work: [...work].reverse() })));
  });

  test("flags deadlines with more work than free time", () => {
    const result = plan(
      input({
        workingHours: { 3: [{ startMin: 9 * 60, endMin: 13 * 60 }] },
        work: [
          { id: "a", title: "A", remainingMin: 180, deadline: "2026-10-28" },
          { id: "b", title: "B", remainingMin: 120, deadline: "2026-10-28" },
        ],
      }),
    );
    expect(result.risks).toEqual([
      { deadline: "2026-10-28", workMin: 300, freeMin: 240, ids: ["a", "b"] },
    ]);
  });
});

test("subtract cuts intervals", () => {
  expect(subtract([{ start: 0, end: 10 }], [{ start: 3, end: 5 }])).toEqual([
    { start: 0, end: 3 },
    { start: 5, end: 10 },
  ]);
});
