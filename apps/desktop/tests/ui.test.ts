import { beforeEach, describe, expect, test } from "bun:test";
import { setWeekStart, ui } from "../src/renderer/src/lib/ui";

/*
 * Changing the first day of the week re-aligns the week view. The fixture week is
 * Mon 26 Oct – Sun 1 Nov 2026, with today on Wednesday the 28th.
 */
const TODAY = "2026-10-28";

describe("setWeekStart", () => {
  beforeEach(() =>
    ui.set({ view: { kind: "days", count: 7 }, anchor: "2026-10-26", weekStart: 1 }),
  );

  test("keeps today's week on screen when today is showing", () => {
    // Aligning from the old Monday used to land on Tue 20 – Mon 26, a week early.
    setWeekStart(2, TODAY);
    expect(ui.get().anchor).toBe("2026-10-27");
    setWeekStart(0, TODAY);
    expect(ui.get().anchor).toBe("2026-10-25");
  });

  test("keeps today showing when it is the last day of the old week", () => {
    setWeekStart(0, "2026-11-01");
    expect(ui.get().anchor).toBe("2026-11-01");
  });

  test("away from today, moves to the week sharing the most days", () => {
    ui.set({ anchor: "2026-12-07" });
    setWeekStart(2, TODAY);
    expect(ui.get().anchor).toBe("2026-12-08");
    setWeekStart(1, TODAY);
    expect(ui.get().anchor).toBe("2026-12-07");
  });

  test("leaves other views where they are", () => {
    ui.set({ view: { kind: "days", count: 3 }, anchor: "2026-10-28" });
    setWeekStart(0, TODAY);
    expect(ui.get()).toMatchObject({ anchor: "2026-10-28", weekStart: 0 });
  });
});
