import { beforeEach, describe, expect, test } from "bun:test";
import {
  goToday,
  jumpTo,
  moveView,
  moveWeek,
  setWeekStart,
  showDays,
  showMonth,
  showYear,
  ui,
} from "../src/renderer/src/lib/ui";

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

/*
 * The year view and the ways out of it. Today is Wed 28 Oct 2026; the week starts on
 * Monday.
 */
describe("year view", () => {
  beforeEach(() =>
    ui.set({
      view: { kind: "days", count: 7 },
      anchor: "2026-10-26",
      weekStart: 1,
      flashDay: null,
    }),
  );

  test("Y shows the year holding today when today is showing", () => {
    // A week straddling New Year with today in January shows the new year.
    ui.set({ anchor: "2026-12-28" });
    showYear("2027-01-02");
    expect(ui.get()).toMatchObject({ view: { kind: "year" }, anchor: "2027-01-02" });
  });

  test("Y keeps the anchor's year away from today", () => {
    ui.set({ anchor: "2028-03-06" });
    showYear(TODAY);
    expect(ui.get()).toMatchObject({ view: { kind: "year" }, anchor: "2028-03-06" });
  });

  test("arrows and J/K move by a year", () => {
    showYear(TODAY);
    moveView(1);
    expect(ui.get().anchor).toBe("2027-10-28");
    moveWeek(-1);
    moveWeek(-1);
    expect(ui.get().anchor).toBe("2025-10-28");
  });

  test("T shows the year holding today and flashes today", () => {
    ui.set({ view: { kind: "year" }, anchor: "2030-05-01" });
    goToday(TODAY);
    expect(ui.get()).toMatchObject({ view: { kind: "year" }, anchor: TODAY, flashDay: TODAY });
  });

  test("leaving for today's year lands on today", () => {
    ui.set({ view: { kind: "year" }, anchor: "2026-02-01" });
    showMonth(TODAY);
    expect(ui.get()).toMatchObject({ view: { kind: "month" }, anchor: TODAY });
    ui.set({ view: { kind: "year" }, anchor: "2026-02-01" });
    showDays(7, TODAY);
    expect(ui.get()).toMatchObject({ view: { kind: "days", count: 7 }, anchor: "2026-10-26" });
    ui.set({ view: { kind: "year" }, anchor: "2026-02-01" });
    showDays(1, TODAY);
    expect(ui.get().anchor).toBe(TODAY);
  });

  test("leaving for another year lands on its first day or month", () => {
    ui.set({ view: { kind: "year" }, anchor: "2027-10-28" });
    showMonth(TODAY);
    expect(ui.get()).toMatchObject({ view: { kind: "month" }, anchor: "2027-01-01" });
    ui.set({ view: { kind: "year" }, anchor: "2027-10-28" });
    showDays(3, TODAY);
    expect(ui.get()).toMatchObject({ view: { kind: "days", count: 3 }, anchor: "2027-01-01" });
    ui.set({ view: { kind: "year" }, anchor: "2027-10-28" });
    // The week holding January 1st, a Friday.
    showDays(7, TODAY);
    expect(ui.get().anchor).toBe("2026-12-28");
  });

  test("a day click opens the week holding it and flashes the day", () => {
    ui.set({ view: { kind: "year" }, anchor: TODAY });
    jumpTo("2026-03-12", TODAY, false);
    expect(ui.get()).toMatchObject({
      view: { kind: "days", count: 7 },
      anchor: "2026-03-09",
      flashDay: "2026-03-12",
    });
  });

  test("a weekend the week view hides opens on its own", () => {
    ui.set({ view: { kind: "year" }, anchor: TODAY });
    jumpTo("2026-03-14", TODAY, true);
    expect(ui.get()).toMatchObject({ view: { kind: "days", count: 1 }, anchor: "2026-03-14" });
  });
});
