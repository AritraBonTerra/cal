import { describe, expect, test } from "bun:test";
import { MONTH_MIN, yearColumns, yearDays, yearMonths } from "../src/renderer/src/lib/year";

describe("yearDays", () => {
  test("covers the anchor's year, January 1st through December 31st", () => {
    const days = yearDays("2026-10-28");
    expect(days).toHaveLength(365);
    expect(days[0]).toBe("2026-01-01");
    expect(days.at(-1)).toBe("2026-12-31");
  });

  test("has 366 days in a leap year", () => {
    const days = yearDays("2028-02-29");
    expect(days).toHaveLength(366);
    expect(days.at(-1)).toBe("2028-12-31");
  });
});

describe("yearMonths", () => {
  test("the 1st of each month of the anchor's year", () => {
    const months = yearMonths("2026-10-28");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-01-01");
    expect(months[1]).toBe("2026-02-01");
    expect(months[11]).toBe("2026-12-01");
  });
});

describe("yearColumns", () => {
  test("four across when the year fits in three rows", () => {
    expect(yearColumns(MONTH_MIN.width * 4, MONTH_MIN.height * 3)).toEqual({
      columns: 4,
      scroll: false,
    });
  });

  test("three across in four rows when four won't fit across", () => {
    expect(yearColumns(MONTH_MIN.width * 4 - 1, MONTH_MIN.height * 4)).toEqual({
      columns: 3,
      scroll: false,
    });
  });

  test("scrolls with as many across as fit when the year doesn't fit", () => {
    // Wide but short: four across, scrolling, rather than two.
    expect(yearColumns(MONTH_MIN.width * 4, MONTH_MIN.height * 3 - 1)).toEqual({
      columns: 4,
      scroll: true,
    });
    expect(yearColumns(MONTH_MIN.width * 3, MONTH_MIN.height * 2)).toEqual({
      columns: 3,
      scroll: true,
    });
  });

  test("two across, scrolling, in a very narrow area, and one when two won't fit", () => {
    expect(yearColumns(MONTH_MIN.width * 3 - 1, 2000)).toEqual({ columns: 2, scroll: true });
    expect(yearColumns(MONTH_MIN.width * 2 - 1, 400)).toEqual({ columns: 1, scroll: true });
  });
});
