import { describe, expect, test } from "bun:test";
import { type DataSource, History } from "@cal/app-core";
import type { ExternalEvent } from "@cal/calendar-source";
import { fromDayKey, toOffsetIso } from "@cal/domain";
import { FixtureCalendar } from "@cal/fixtures";
import { parseQuickEntry } from "@cal/nlp";
import { parseClock, parseDurationText } from "../src/renderer/src/lib/clockText";
import {
  backspaceTarget,
  pieces,
  prefixKind,
  shiftLiterals,
} from "../src/renderer/src/lib/entryText";
import {
  applyEntry,
  closeEditor,
  deleteWithUndo,
  type EventForm,
  editorStore,
  entryInput,
  eventPatch,
  eventWriter,
  formDay,
  nextFreeSlot,
  openCreate,
  parseDraft,
  patchForm,
  previousValues,
  restoreInput,
} from "../src/renderer/src/lib/events";
import { mapsUrl } from "../src/renderer/src/lib/maps";
import { describeRule, repeatPresets } from "../src/renderer/src/lib/recurrence";
import { toasts } from "../src/renderer/src/lib/toast";
import { deviceZone, zonedDayKey, zonedMinutes } from "../src/renderer/src/lib/zones";

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

  test("takes 24-hour input literally, and a leading zero in either format", () => {
    expect(parseClock("06:30", false)).toBe(6 * 60 + 30);
    expect(parseClock("6:30", false)).toBe(6 * 60 + 30);
    expect(parseClock("3", false)).toBe(3 * 60);
    expect(parseClock("3pm", false)).toBe(15 * 60);
    expect(parseClock("06:30")).toBe(6 * 60 + 30);
    expect(parseClock("18:30")).toBe(18 * 60 + 30);
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

/*
 * The draft form behind the popover: how a parsed title lays over the slot, the day it
 * shows, and what it hands the parser.
 */
const slot = { start: new Date(2026, 9, 28, 10, 0), end: new Date(2026, 9, 28, 10, 30) };
const typedAt = new Date(2026, 9, 28, 10, 0);
const draftForm = (patch: Partial<EventForm> = {}): EventForm => ({
  text: "",
  literals: [],
  title: "",
  kind: "event",
  start: slot.start,
  end: slot.end,
  allDay: false,
  timeZone: deviceZone,
  recurrence: "",
  location: "",
  url: "",
  notes: "",
  calendarId: "work",
  busy: true,
  alarms: [],
  projectUuid: null,
  deadline: null,
  ...patch,
});
const parseEvent = (text: string, timeZone = deviceZone) =>
  parseQuickEntry(text, {
    now: typedAt,
    surface: "grid",
    kind: "event",
    defaultEventMin: 30,
    timeZone,
  });

describe("applyEntry", () => {
  test("a timed multi-day range keeps the parser's instants", () => {
    const form = applyEntry(draftForm(), parseEvent("Trip Nov 20 8am to Nov 22 6pm"));
    expect(form.allDay).toBe(false);
    expect(form.start).toEqual(new Date(2026, 10, 20, 8));
    expect(form.end).toEqual(new Date(2026, 10, 22, 18));
  });

  test("a date range without times is all-day", () => {
    const form = applyEntry(draftForm(), parseEvent("Trip Nov 20 to Nov 22"));
    expect(form.allDay).toBe(true);
    expect(form.start).toEqual(fromDayKey("2026-11-20"));
    expect(form.end).toEqual(fromDayKey("2026-11-23"));
  });

  test("a duration alone lengthens the slot from its start", () => {
    const form = applyEntry(draftForm(), parseEvent("Lunch for 2h"));
    expect(form.start).toEqual(slot.start);
    expect(form.end).toEqual(new Date(2026, 9, 28, 12, 0));
  });

  test("a time without a date lands on the slot's day in the form's zone", () => {
    const base = draftForm({ timeZone: "Asia/Tokyo" });
    const form = applyEntry(base, parseEvent("Lunch 9am", "Asia/Tokyo"));
    expect(zonedDayKey(form.start, "Asia/Tokyo")).toBe(zonedDayKey(slot.start, "Asia/Tokyo"));
    expect(zonedMinutes(form.start, "Asia/Tokyo")).toBe(9 * 60);
    expect(form.end.getTime() - form.start.getTime()).toBe(30 * 60_000);
  });

  test("a typed prefix shows as the form's kind", () => {
    const entry = parseQuickEntry("task Buy stamps", { now: typedAt, surface: "grid" });
    expect(applyEntry(draftForm(), entry).kind).toBe("task");
  });
});

describe("formDay", () => {
  test("an all-day event shows its calendar day whatever the form's zone", () => {
    const form = draftForm({
      allDay: true,
      start: fromDayKey("2026-10-30"),
      end: fromDayKey("2026-10-31"),
    });
    expect(formDay({ ...form, timeZone: "Pacific/Pago_Pago" })).toBe("2026-10-30");
    expect(formDay({ ...form, timeZone: "Pacific/Kiritimati" })).toBe("2026-10-30");
  });

  test("a timed event shows the day of its start in the form's zone", () => {
    // 10:00 on the 28th in Honolulu is already the 29th in Tokyo.
    const start = new Date("2026-10-28T20:00:00Z");
    const form = draftForm({ start, end: new Date(start.getTime() + 30 * 60_000) });
    expect(formDay({ ...form, timeZone: "Pacific/Honolulu" })).toBe("2026-10-28");
    expect(formDay({ ...form, timeZone: "Asia/Tokyo" })).toBe("2026-10-29");
  });
});

describe("parseDraft", () => {
  const context = {
    now: typedAt,
    calendars: [],
    projects: [],
    weekStartsOn: 1,
    defaultEventMin: 30,
    canCreateEvents: true,
  };
  const open = (timeZone: string) => {
    openCreate(slot, { calendarId: "work", timeZone, reminder: null, canCreateEvents: true });
    const { editor } = editorStore.get();
    if (!editor) throw new Error("no draft");
    return editor;
  };

  test("reads times without a zone in the form's zone", () => {
    const editor = open("Asia/Tokyo");
    const entry = parseDraft(editor, "Lunch 9am", [], context);
    if (entry.kind !== "event") throw new Error("expected an event");
    expect(entry.start.endsWith("+09:00")).toBe(true);
    expect(zonedMinutes(new Date(entry.start), "Asia/Tokyo")).toBe(9 * 60);
    closeEditor();
  });

  test("a typed prefix names the kind until the switch is used", () => {
    const editor = open(deviceZone);
    expect(parseDraft(editor, "task Buy stamps", [], context).kind).toBe("task");
    expect(parseDraft(editor, "Buy stamps", [], context).kind).toBe("event");
    // An un-parsed prefix is title text.
    expect(parseDraft(editor, "task Buy stamps", [{ start: 0, end: 5 }], context).kind).toBe(
      "event",
    );
    patchForm({ kind: "event" });
    const chosen = editorStore.get().editor;
    if (!chosen) throw new Error("no draft");
    expect(parseDraft(chosen, "task Buy stamps", [], context).kind).toBe("event");
    closeEditor();
  });
});

describe("entryInput", () => {
  test("an all-day entry is sent as local midnights with an offset", () => {
    const entry = parseEvent("Picnic tomorrow");
    if (entry.kind !== "event") throw new Error("expected an event");
    const input = entryInput(entry, { calendarId: "work", zone: deviceZone, reminder: 10 });
    expect(input.start).toBe(toOffsetIso(fromDayKey("2026-10-29")));
    expect(input.end).toBe(toOffsetIso(fromDayKey("2026-10-30")));
    expect(Number.isNaN(Date.parse(input.start))).toBe(false);
    expect(input).toMatchObject({ allDay: true, busy: false, timeZone: undefined, alarms: [] });
  });

  test("a timed entry keeps the parser's instants, the grid zone and the default reminder", () => {
    const entry = parseEvent("Lunch tomorrow 1pm");
    if (entry.kind !== "event") throw new Error("expected an event");
    const input = entryInput(entry, { calendarId: "work", zone: "Asia/Tokyo", reminder: 10 });
    expect(input).toMatchObject({
      start: entry.start,
      end: entry.end,
      allDay: false,
      busy: true,
      timeZone: "Asia/Tokyo",
      alarms: [10],
    });
  });
});

describe("mapsUrl", () => {
  test("builds a search link for the chosen maps app", () => {
    expect(mapsUrl("Blue Bottle, Oakland", "apple")).toBe(
      "https://maps.apple.com/?q=Blue%20Bottle%2C%20Oakland",
    );
    expect(mapsUrl("Blue Bottle, Oakland", "google")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Blue%20Bottle%2C%20Oakland",
    );
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

  test("a COUNT series restored from a later occurrence keeps only the remaining count", () => {
    const fifth = {
      ...event,
      recurrence: "FREQ=DAILY;COUNT=7",
      start: "2026-10-30T09:30:00-07:00",
      end: "2026-10-30T09:45:00-07:00",
      seriesStart: "2026-10-26T09:30:00-07:00",
      seriesEnd: "2026-10-26T09:45:00-07:00",
    };
    expect(restoreInput(fifth, "future").recurrence).toBe("FREQ=DAILY;COUNT=3");
    expect(restoreInput(fifth, "all").recurrence).toBe("FREQ=DAILY;COUNT=7");
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
    const titled = async (title: string, from = "2026-10-26", to = "2026-11-02") =>
      (await calendar.events(`${from}T00:00:00`, `${to}T00:00:00`)).filter(
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

  test("undoing 'delete this and following' keeps a COUNT series at its original length", async () => {
    const { history, writer, titled } = setup();
    await writer.create({
      calendarId: "work",
      title: "Yoga",
      start: "2026-10-29T15:00:00-07:00",
      end: "2026-10-29T16:00:00-07:00",
      allDay: false,
      recurrence: "FREQ=DAILY;COUNT=3",
    });
    const second = (await titled("Yoga")).find((each) => each.start.startsWith("2026-10-30"));
    if (!second) throw new Error("no second Yoga");
    await writer.remove(second, "future");
    expect((await titled("Yoga")).map((each) => each.start.slice(0, 10))).toEqual(["2026-10-29"]);
    await history.undo();
    expect((await titled("Yoga")).map((each) => each.start.slice(0, 10)).sort()).toEqual([
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
    await history.redo();
    expect((await titled("Yoga")).length).toBe(1);
  });

  test("an 'all' edit undone after an 'all' delete and its undo reaches the recreated series", async () => {
    const { history, writer, titled } = setup();
    const monday = await standupOn(titled, "2026-10-26");
    if (!monday) throw new Error("no Monday standup");
    await writer.update(monday, { title: "Daily standup" }, "all");
    const tuesday = (await titled("Daily standup")).find((each) =>
      each.start.startsWith("2026-10-27"),
    );
    if (!tuesday) throw new Error("no Tuesday standup");
    await writer.remove(tuesday, "all");
    expect((await titled("Daily standup")).length).toBe(0);
    await history.undo();
    expect((await titled("Daily standup")).length).toBe(5);
    await history.undo();
    const restored = await titled("Standup");
    expect(restored.map((each) => each.start.slice(0, 10)).sort()).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    expect(new Set(restored.map((each) => each.start.slice(11, 16)))).toEqual(new Set(["09:30"]));
    expect((await titled("Daily standup")).length).toBe(0);
    await history.redo();
    expect((await titled("Daily standup")).length).toBe(5);
  });

  test("undoing a cleared repeat from a later occurrence restores the series", async () => {
    const { history, writer, titled } = setup();
    const wednesday = await standupOn(titled, "2026-10-28");
    if (!wednesday) throw new Error("no Wednesday standup");
    await writer.update(wednesday, { recurrence: "" }, "all");
    const kept = await titled("Standup");
    expect(kept.map((each) => each.start.slice(0, 10))).toEqual(["2026-10-26"]);
    expect(kept[0]?.recurring).toBe(false);
    await history.undo();
    const restored = await titled("Standup");
    expect(restored.map((each) => each.start.slice(0, 10)).sort()).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    expect(restored.every((each) => each.recurring)).toBe(true);
    await history.redo();
    expect((await titled("Standup")).length).toBe(1);
  });

  test("a one-off given a repeat becomes a series' first occurrence", async () => {
    const { calendar, titled } = setup();
    const [planning] = await titled("Planning");
    if (!planning) throw new Error("no Planning");
    const written = await calendar.updateEvent(
      planning.id,
      { recurrence: "FREQ=DAILY;COUNT=3" },
      "this",
    );
    expect(written.id).toBe(`${planning.id}|${planning.start}`);
    expect(written.recurring).toBe(true);
    expect((await titled("Planning")).map((each) => each.start.slice(0, 10))).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
    ]);
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

describe("eventWriter: ids that change under a series", () => {
  const setup = () => {
    const calendar = new FixtureCalendar();
    const history = new History({
      list: async () => [],
      get: async () => undefined,
      insert: async () => "",
      update: async () => false,
      remove: async () => false,
      subscribe: () => () => {},
    });
    const writer = eventWriter(history, async () => {}, calendar);
    const titled = async (title: string, from = "2026-10-26", to = "2026-11-02") =>
      (await calendar.events(`${from}T00:00:00`, `${to}T00:00:00`)).filter(
        (each) => each.title === title,
      );
    return { calendar, history, writer, titled };
  };
  const days = (events: readonly ExternalEvent[]) =>
    events.map((each) => each.start.slice(0, 10)).sort();

  test("undoing an 'all' move made from a later occurrence reaches the moved series", async () => {
    const { history, writer, titled } = setup();
    const wednesday = (await titled("Standup")).find((each) => each.start.startsWith("2026-10-28"));
    if (!wednesday) throw new Error("no Wednesday standup");
    const shift = (iso: string) => toOffsetIso(new Date(Date.parse(iso) + 24 * 60 * 60_000));
    await writer.update(
      wednesday,
      { start: shift(wednesday.start), end: shift(wednesday.end) },
      "all",
    );
    const moved = await titled("Standup");
    expect(days(moved)).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
    // A device calendar names an occurrence by its start, so the moved one has a new id.
    expect(moved.find((each) => each.start === shift(wednesday.start))?.id).not.toBe(wednesday.id);
    await history.undo();
    expect(days(await titled("Standup"))).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    await history.redo();
    expect(days(await titled("Standup"))).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
    await history.undo();
    expect(days(await titled("Standup"))[0]).toBe("2026-10-26");
  });

  test("undoing a repeat added to a one-off leaves one event", async () => {
    const { history, writer, titled } = setup();
    const [planning] = await titled("Planning");
    if (!planning) throw new Error("no Planning");
    await writer.update(planning, { recurrence: "FREQ=DAILY;COUNT=3" }, "this");
    expect((await titled("Planning")).length).toBe(3);
    await history.undo();
    const back = await titled("Planning");
    expect(back.length).toBe(1);
    expect(back[0]?.recurring).toBe(false);
    await history.redo();
    expect((await titled("Planning")).length).toBe(3);
    await history.undo();
    expect((await titled("Planning")).length).toBe(1);
  });

  test("the delete toast's Undo goes away once another step lands", async () => {
    const { history, writer, titled } = setup();
    const [planning] = await titled("Planning");
    if (!planning) throw new Error("no Planning");
    await deleteWithUndo(planning, "this", writer, history);
    expect(toasts.get().toast?.action?.label).toBe("Undo");
    const [retro] = await titled("Retro");
    if (!retro) throw new Error("no Retro");
    await writer.update(retro, { title: "Retrospective" }, "this");
    expect(toasts.get().toast).toBeNull();
    // Undo now reverses the rename, not the delete; the toast no longer offers it.
    await history.undo();
    expect((await titled("Planning")).length).toBe(0);
    expect((await titled("Retro")).length).toBe(1);
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
