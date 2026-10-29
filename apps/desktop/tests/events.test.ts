import { describe, expect, test } from "bun:test";
import { type DataSource, History } from "@cal/app-core";
import type { ExternalEvent } from "@cal/calendar-source";
import { FixtureCalendar } from "@cal/fixtures";
import { parseClock, parseDurationText } from "../src/renderer/src/lib/clockText";
import {
  backspaceTarget,
  pieces,
  prefixKind,
  shiftLiterals,
} from "../src/renderer/src/lib/entryText";
import {
  eventPatch,
  eventWriter,
  nextFreeSlot,
  previousValues,
  restoreInput,
} from "../src/renderer/src/lib/events";
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

  test("clears a location with an empty string, which survives the trip over IPC", () => {
    const placed = { ...event, location: "Room 4", notes: "Bring slides" };
    const patch = eventPatch(placed, {
      calendarId: "work",
      title: "Standup",
      start: placed.start,
      end: placed.end,
      allDay: false,
      recurrence: "FREQ=DAILY",
      busy: true,
      alarms: [10],
    });
    expect(patch).toEqual({ location: "", notes: "" });
    expect(JSON.parse(JSON.stringify(patch))).toEqual({ location: "", notes: "" });
  });

  test("undoing the first reminder sends an empty list", () => {
    const quiet: ExternalEvent = { ...event, alarms: undefined };
    const patch = eventPatch(quiet, { ...inputOf(quiet), alarms: [10] });
    expect(patch).toEqual({ alarms: [10] });
    expect(previousValues(quiet, patch)).toEqual({ alarms: [] });
  });

  test("restores a deleted occurrence as a one-off and a series from its first occurrence", () => {
    const later = {
      ...event,
      start: "2026-10-30T09:30:00-07:00",
      end: "2026-10-30T09:45:00-07:00",
      seriesStart: "2026-10-26T09:30:00-07:00",
      seriesEnd: "2026-10-26T09:45:00-07:00",
    };
    expect(restoreInput(later, "this")).toMatchObject({
      start: later.start,
      recurrence: undefined,
    });
    expect(restoreInput(later, "future")).toMatchObject({
      start: later.start,
      recurrence: "FREQ=DAILY",
    });
    expect(restoreInput(later, "all")).toMatchObject({
      start: later.seriesStart,
      end: later.seriesEnd,
      recurrence: "FREQ=DAILY",
    });
  });
});

const inputOf = (event: ExternalEvent) => ({
  calendarId: event.calendarId,
  title: event.title,
  start: event.start,
  end: event.end,
  allDay: event.allDay,
  recurrence: event.recurrence,
  busy: event.busy,
});

/*
 * The writer's undo steps against the fixture calendar, which models a series the way
 * a device calendar does: a span reaches the other occurrences.
 */
describe("eventWriter", () => {
  // Device events live outside Cal's tables, so History never touches the source.
  const noSource: DataSource = {
    list: async () => [],
    get: async () => undefined,
    insert: async () => "",
    update: async () => false,
    remove: async () => false,
    subscribe: () => () => {},
  };
  const setup = () => {
    const calendar = new FixtureCalendar();
    const history = new History(noSource);
    const writer = eventWriter(history, async () => {}, calendar);
    const titled = async (title: string) =>
      (await calendar.events("2026-10-26T00:00:00", "2026-11-02T00:00:00")).filter(
        (each) => each.title === title,
      );
    return { calendar, history, writer, titled };
  };
  const standupOn = async (titled: ReturnType<typeof setup>["titled"], day: string) =>
    (await titled("Standup")).find((each) => each.start.startsWith(day));

  test("undoing a repeating event's creation removes the whole series", async () => {
    const { history, writer, titled } = setup();
    await writer.create({
      calendarId: "work",
      title: "Yoga",
      start: "2026-10-29T15:00:00-07:00",
      end: "2026-10-29T16:00:00-07:00",
      allDay: false,
      recurrence: "FREQ=DAILY;COUNT=3",
    });
    expect((await titled("Yoga")).length).toBe(3);
    await history.undo();
    expect((await titled("Yoga")).length).toBe(0);
    await history.redo();
    expect((await titled("Yoga")).length).toBe(3);
    await history.undo();
    expect((await titled("Yoga")).length).toBe(0);
  });

  test("undoing 'delete this occurrence' brings back just that occurrence", async () => {
    const { history, writer, titled } = setup();
    const wednesday = await standupOn(titled, "2026-10-28");
    if (!wednesday) throw new Error("no Wednesday standup");
    await writer.remove(wednesday, "this");
    expect((await titled("Standup")).length).toBe(4);
    await history.undo();
    const restored = await titled("Standup");
    expect(restored.length).toBe(5);
    expect(restored.filter((each) => each.start.startsWith("2026-10-28")).length).toBe(1);
    await history.redo();
    expect((await titled("Standup")).length).toBe(4);
  });

  test("undoing 'delete all' from a later occurrence restores the series from its first", async () => {
    const { history, writer, titled } = setup();
    const wednesday = await standupOn(titled, "2026-10-28");
    if (!wednesday) throw new Error("no Wednesday standup");
    await writer.remove(wednesday, "all");
    expect((await titled("Standup")).length).toBe(0);
    await history.undo();
    const restored = await titled("Standup");
    expect(restored.map((each) => each.start.slice(0, 10)).sort()).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    await history.redo();
    expect((await titled("Standup")).length).toBe(0);
  });

  test("undoing 'delete this and following' restores from the deleted occurrence", async () => {
    const { history, writer, titled } = setup();
    const wednesday = await standupOn(titled, "2026-10-28");
    if (!wednesday) throw new Error("no Wednesday standup");
    await writer.remove(wednesday, "future");
    expect((await titled("Standup")).map((each) => each.start.slice(0, 10))).toEqual([
      "2026-10-26",
      "2026-10-27",
    ]);
    await history.undo();
    expect((await titled("Standup")).length).toBe(5);
  });

  test("an edit undone after a delete and its undo reaches the recreated event", async () => {
    const { history, writer, titled } = setup();
    const [planning] = await titled("Planning");
    if (!planning) throw new Error("no Planning");
    await writer.update(planning, { title: "Sprint planning" }, "this");
    const [renamed] = await titled("Sprint planning");
    if (!renamed) throw new Error("rename failed");
    await writer.remove(renamed, "this");
    await history.undo();
    const [recreated] = await titled("Sprint planning");
    expect(recreated?.id).not.toBe(planning.id);
    await history.undo();
    expect((await titled("Planning")).length).toBe(1);
    expect((await titled("Sprint planning")).length).toBe(0);
    await history.redo();
    expect((await titled("Sprint planning")).length).toBe(1);
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
