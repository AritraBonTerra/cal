import { describe, expect, test } from "bun:test";
import type { ExternalEvent } from "@cal/calendar-source";
import { parseClock, parseDurationText } from "../src/renderer/src/lib/clockText";
import {
  backspaceTarget,
  pieces,
  prefixKind,
  shiftLiterals,
} from "../src/renderer/src/lib/entryText";
import { eventPatch, nextFreeSlot, previousValues } from "../src/renderer/src/lib/events";
import { describeRule, repeatPresets } from "../src/renderer/src/lib/recurrence";

/*
 * Pure helpers behind the event popover and Quick Entry: typed times, literal spans
 * that follow edits, repeat presets, and the diff an edit sends to the calendar.
 */

describe("parseClock", () => {
  test("reads Cron's shorthand", () => {
    expect(parseClock("16:30")).toBe(16 * 60 + 30);
    expect(parseClock("4p")).toBe(16 * 60);
    expect(parseClock("4:30 PM")).toBe(16 * 60 + 30);
    expect(parseClock("9")).toBe(9 * 60);
    expect(parseClock("3")).toBe(15 * 60);
    expect(parseClock("12")).toBe(12 * 60);
    expect(parseClock("12am")).toBe(0);
    expect(parseClock("lunch")).toBeUndefined();
  });

  test("reads durations", () => {
    expect(parseDurationText("45")).toBe(45);
    expect(parseDurationText("45m")).toBe(45);
    expect(parseDurationText("1h30")).toBe(90);
    expect(parseDurationText("1.5h")).toBe(90);
    expect(parseDurationText("1:15")).toBe(75);
    expect(parseDurationText("2 hours")).toBe(120);
  });
});

describe("literals", () => {
  const tomorrow = { start: 6, end: 14 };

  test("shift past an insertion before them and stay put after one behind them", () => {
    expect(shiftLiterals([tomorrow], "Lunch tomorrow", "Big lunch tomorrow")).toEqual([
      { start: 10, end: 18 },
    ]);
    expect(shiftLiterals([tomorrow], "Lunch tomorrow", "Lunch tomorrow 1pm")).toEqual([tomorrow]);
  });

  test("are dropped when the edit touches them", () => {
    expect(shiftLiterals([tomorrow], "Lunch tomorrow", "Lunch tomorow")).toEqual([]);
  });

  test("a leading mode word names the kind", () => {
    expect(prefixKind("event Lunch")).toBe("event");
    expect(prefixKind("todo Lunch")).toBe("task");
    expect(prefixKind("Lunch event")).toBeUndefined();
  });

  test("Backspace targets only a token recognized by the latest edit", () => {
    const token = {
      kind: "when" as const,
      start: 6,
      end: 14,
      confidence: "certain" as const,
      label: "Tomorrow",
      applied: true,
    };
    expect(backspaceTarget([token], 14, new Set())).toBe(token);
    expect(backspaceTarget([token], 14, new Set(["when:6-14"]))).toBeUndefined();
    expect(backspaceTarget([token], 10, new Set())).toBeUndefined();
  });

  test("pieces skip overlapping spans", () => {
    const a = {
      kind: "time" as const,
      start: 0,
      end: 5,
      confidence: "guess" as const,
      label: "",
      applied: true,
    };
    const b = {
      kind: "duration" as const,
      start: 3,
      end: 8,
      confidence: "certain" as const,
      label: "",
      applied: true,
    };
    expect(pieces("at 3 for 1h", [a, b]).map((piece) => piece.text)).toEqual(["at 3 ", "for 1h"]);
  });
});

describe("repeatPresets", () => {
  test("builds weekday, nth and last presets from the date", () => {
    const labels = repeatPresets("2026-10-28").map((preset) => preset.label);
    expect(labels).toContain("Weekly on Wednesday");
    expect(labels).toContain("Monthly on the 4th Wednesday");
    expect(labels).toContain("Monthly on the last Wednesday");
    expect(labels).toContain("Yearly on Oct 28");
    expect(repeatPresets("2026-10-07").map((preset) => preset.label)).not.toContain(
      "Monthly on the last Wednesday",
    );
  });

  test("describes a custom rule", () => {
    expect(describeRule("FREQ=WEEKLY;INTERVAL=3;BYDAY=TU,TH")).toBe("Every 3 weeks on Tue, Thu");
    expect(describeRule("FREQ=DAILY;COUNT=5")).toBe("Every day, 5 times");
  });
});

describe("eventPatch", () => {
  const event: ExternalEvent = {
    id: "1",
    calendarId: "work",
    title: "Standup",
    start: "2026-10-28T09:30:00-07:00",
    end: "2026-10-28T09:45:00-07:00",
    allDay: false,
    recurring: true,
    recurrence: "FREQ=DAILY",
    busy: true,
    alarms: [10],
  };

  test("sends only what changed, and clears a repeat with an empty string", () => {
    const patch = eventPatch(event, {
      calendarId: "work",
      title: "Daily standup",
      start: "2026-10-28T16:30:00Z",
      end: "2026-10-28T09:45:00-07:00",
      allDay: false,
      busy: true,
      alarms: [10],
    });
    expect(patch).toEqual({ title: "Daily standup", recurrence: "" });
    expect(previousValues(event, patch)).toEqual({ title: "Standup", recurrence: "FREQ=DAILY" });
  });
});

describe("nextFreeSlot", () => {
  test("starts at the next quarter hour and skips busy spans", () => {
    const at = (hour: number, minute = 0) => new Date(2026, 9, 28, hour, minute);
    expect(nextFreeSlot(at(10, 40), 30, [])).toEqual({ start: at(10, 45), end: at(11, 15) });
    expect(nextFreeSlot(at(10, 40), 30, [{ start: at(11), end: at(11, 20) }])).toEqual({
      start: at(11, 30),
      end: at(12),
    });
  });
});
