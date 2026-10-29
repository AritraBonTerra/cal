import { expect, test } from "bun:test";
import { wallMove, zonedInstant } from "../src";

const iso = (ms: number | Date) => new Date(ms).toISOString();

test("a repeated fall-back time means its first pass; a skipped one moves forward", () => {
  // Paris falls back at 03:00 CEST on Oct 25, 2026, so 02:30 happens twice.
  expect(iso(zonedInstant("2026-10-25", 150, "Europe/Paris"))).toBe("2026-10-25T00:30:00.000Z");
  // New York springs forward at 02:00 on Mar 8, 2026: 02:30 reads as 03:30 EDT.
  expect(iso(zonedInstant("2026-03-08", 150, "America/New_York"))).toBe("2026-03-08T07:30:00.000Z");
  expect(iso(zonedInstant("2026-07-01", 9 * 60, "Asia/Kolkata"))).toBe("2026-07-01T03:30:00.000Z");
});

test("a wall-clock move keeps clock times across DST and keeps seconds", () => {
  const zone = "America/Los_Angeles";
  // Oct 31 09:00 PDT → Nov 1 09:00 PST: 25 hours, one day on the clock.
  const move = wallMove(
    new Date("2026-10-31T09:00:00-07:00"),
    new Date("2026-11-01T09:00:00-08:00"),
    zone,
  );
  expect(iso(move(new Date("2026-10-30T09:00:00-07:00")))).toBe("2026-10-31T16:00:00.000Z");
  const half = wallMove(
    new Date("2026-10-30T10:00:30-07:00"),
    new Date("2026-10-30T10:30:30-07:00"),
    zone,
  );
  expect(iso(half(new Date("2026-10-31T10:00:30-07:00")))).toBe("2026-10-31T17:30:30.000Z");
});
