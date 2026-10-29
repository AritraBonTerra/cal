import type { History } from "@cal/app-core";
import type {
  CalendarSource,
  DeviceCalendar,
  EventInput,
  EventSpan,
  ExternalEvent,
} from "@cal/calendar-source";
import {
  addDays,
  atMinute,
  type DayKey,
  daysBetween,
  expandRule,
  fromDayKey,
  ruleCount,
  toDayKey,
  toOffsetIso,
  withCount,
} from "@cal/domain";
import {
  type EventEntry,
  parseQuickEntry,
  type QuickEntry,
  type TaskEntry,
  type TokenKind,
} from "@cal/nlp";
import { type Literal, prefixKind } from "./entryText";
import { createStore, useStore } from "./store";
import { dismissToast, showToast } from "./toast";
import { deviceZone, zonedDayKey, zonedInstant, zonedMinutes } from "./zones";

/*
 * Event creation and editing. One popover serves both: `openCreate` starts a draft
 * from a grid span (or `C`), `openEdit` loads an existing device event. The form lives
 * in a store so the grid can draw the draft chip as the fields change. Writes go
 * through `eventWriter`, which records each one as an undoable History step, and
 * `askSpan` shows the "This event / This and following / All events" dialog.
 */

export type EntryKind = "event" | "task";

export interface EventForm {
  // The title field's raw text; new events parse it for dates, times and the rest.
  text: string;
  literals: Literal[];
  // The title as it will be saved: the text minus its recognized tokens.
  title: string;
  kind: EntryKind;
  start: Date;
  end: Date;
  allDay: boolean;
  // IANA zone the times are typed in.
  timeZone: string;
  // RRULE body; "" for no repeat.
  recurrence: string;
  location: string;
  url: string;
  notes: string;
  calendarId: string;
  busy: boolean;
  alarms: number[];
  // To-do mode only.
  projectUuid: string | null;
  deadline: DayKey | null;
}

export interface EditorState {
  mode: "create" | "edit";
  // The occurrence being edited; absent while creating.
  event?: ExternalEvent;
  // What the fields hold: `base` is the slot plus the user's edits, `form` is `base`
  // with whatever the title text parsed to laid over it. The grid draws `form`.
  base: EventForm;
  form: EventForm;
  // `data-item` key of the chip the popover grows from ("draft" or "event:<id>").
  anchor: string;
  dirty: boolean;
  // Whether the user picked Event or To-do (⌘1/⌘2, the switch); until then a typed
  // "task " / "event " prefix decides.
  kindChosen: boolean;
}

export const editorStore = createStore<{ editor: EditorState | null }>({ editor: null });

export const useEditor = () => useStore(editorStore, (state) => state.editor);

// The kind last chosen in the popover; Event on first launch (research/08 §D).
let lastKind: EntryKind = "event";

interface CreateDefaults {
  calendarId: string;
  timeZone: string;
  reminder: number | null;
  // Whether any calendar accepts new events; without one the popover offers To-do only.
  canCreateEvents: boolean;
}

// Opens the popover on a new draft spanning `start`–`end`.
export function openCreate(span: { start: Date; end: Date }, defaults: CreateDefaults) {
  const kind = defaults.canCreateEvents ? lastKind : "task";
  const form: EventForm = {
    text: "",
    literals: [],
    title: "",
    kind,
    start: span.start,
    end: span.end,
    allDay: false,
    timeZone: defaults.timeZone,
    recurrence: "",
    location: "",
    url: "",
    notes: "",
    calendarId: defaults.calendarId,
    busy: true,
    alarms: defaults.reminder === null ? [] : [defaults.reminder],
    projectUuid: null,
    deadline: null,
  };
  editorStore.set({
    editor: { mode: "create", anchor: "draft", dirty: false, kindChosen: false, base: form, form },
  });
}

// Opens the popover on an existing event, fields filled from it.
export function openEdit(event: ExternalEvent, deviceZone: string) {
  const form: EventForm = {
    text: event.title,
    literals: [],
    title: event.title,
    kind: "event",
    start: new Date(event.start),
    end: new Date(event.end),
    allDay: event.allDay,
    timeZone: event.timeZone ?? deviceZone,
    recurrence: event.recurrence ?? "",
    location: event.location ?? "",
    url: event.url ?? "",
    notes: event.notes ?? "",
    calendarId: event.calendarId,
    busy: event.busy,
    alarms: event.alarms ?? [],
    projectUuid: null,
    deadline: null,
  };
  editorStore.set({
    editor: {
      mode: "edit",
      event,
      anchor: `event:${event.id}`,
      dirty: false,
      kindChosen: true,
      base: form,
      form,
    },
  });
}

export const closeEditor = () => editorStore.set({ editor: null });

// Changes fields the user set by hand; every change marks the draft dirty.
export function patchForm(patch: Partial<EventForm>) {
  editorStore.set(({ editor }) =>
    editor
      ? {
          editor: {
            ...editor,
            base: { ...editor.base, ...patch },
            form: { ...editor.form, ...patch },
            dirty: true,
            kindChosen: editor.kindChosen || patch.kind !== undefined,
          },
        }
      : {},
  );
  if (patch.kind) lastKind = patch.kind;
}

/*
 * Switches a draft between event and to-do. With a context (a new draft) the title is
 * read again as the new kind, so what only one kind keeps, like a URL or a deadline,
 * goes back into the title or out to its field.
 */
export function setFormKind(kind: EventForm["kind"], context?: DraftContext) {
  patchForm({ kind });
  const { editor } = editorStore.get();
  if (!editor || !context || !editor.base.text) return;
  const { text, literals } = editor.base;
  setFormText(text, literals, parseDraft(editor, text, literals, context));
}

// A new title text and its parse: the parsed fields lay over the slot and manual edits.
export function setFormText(text: string, literals: Literal[], entry: QuickEntry | null) {
  editorStore.set(({ editor }) => {
    if (!editor) return {};
    const base = { ...editor.base, text, literals, title: entry ? entry.title : text.trim() };
    return {
      editor: { ...editor, base, form: entry ? applyEntry(base, entry) : base, dirty: true },
    };
  });
}

// Moves the event to `zone`, keeping its wall-clock times (10:00 PDT → 10:00 GMT).
export function setFormZone(zone: string) {
  const { editor } = editorStore.get();
  if (!editor) return;
  const { form } = editor;
  const day = zonedDayKey(form.start, form.timeZone);
  const start = zonedInstant(day, zonedMinutes(form.start, form.timeZone), zone);
  patchForm({ timeZone: zone, start, end: new Date(start.getTime() + length(form)) });
}

const length = (span: { start: Date | string; end: Date | string }) =>
  new Date(span.end).getTime() - new Date(span.start).getTime();

// What the popover hands the parser besides the text.
export interface DraftContext {
  now: Date;
  calendars: readonly { id: string; title: string }[];
  projects: readonly { uuid: string; title: string }[];
  weekStartsOn: number;
  defaultEventMin: number;
  canCreateEvents: boolean;
}

/**
 * Parses a draft's title. Times without a zone are read in the form's zone, and the
 * kind is the one the user switched to, else what a typed "task " / "event " prefix
 * names, else the draft's own; the text's shape never flips a grid draft.
 */
export function parseDraft(
  editor: Pick<EditorState, "base" | "kindChosen">,
  text: string,
  literals: readonly Literal[],
  context: DraftContext,
): QuickEntry {
  const typed =
    context.canCreateEvents && !editor.kindChosen ? typedKind(text, literals) : undefined;
  return parseQuickEntry(text, {
    now: context.now,
    surface: "grid",
    kind: typed ?? editor.base.kind,
    calendars: context.calendars,
    projects: context.projects,
    literals,
    weekStartsOn: context.weekStartsOn,
    defaultEventMin: context.defaultEventMin,
    timeZone: editor.base.timeZone,
  });
}

// The kind a leading prefix names, unless the user un-parsed it (a literal from 0).
const typedKind = (text: string, literals: readonly Literal[]) =>
  literals.some((literal) => literal.start === 0) ? undefined : prefixKind(text);

/**
 * `base` with the fields a parse set laid over it. A date token moves the day and keeps
 * the slot's time; a time token sets the time and keeps the slot's day unless the text
 * named one; a duration alone lengthens the slot; "all day" and date ranges without
 * times make it all-day. A "task " / "event " prefix sets the kind. Fields the text
 * didn't mention stay as they are, so un-parsing a token restores the slot.
 */
export function applyEntry(base: EventForm, entry: QuickEntry): EventForm {
  const has = (kind: TokenKind) => entry.tokens.some((t) => t.applied && t.kind === kind);
  const zone = base.timeZone;
  const hasDate = has("when") || has("date_range");
  const hasTime = has("time") || has("time_range");
  const form = { ...base, kind: entry.kind };
  if (entry.kind === "event") {
    if (entry.allDay && has("date_range")) {
      form.allDay = true;
      form.start = fromDayKey(entry.start);
      form.end = fromDayKey(entry.end);
    } else if (entry.allDay && hasDate && base.allDay) {
      // An all-day draft moved to "tomorrow": the same number of floating days from there.
      const days = daysBetween(toDayKey(base.start), toDayKey(base.end));
      form.start = fromDayKey(entry.start);
      form.end = fromDayKey(addDays(entry.start, Math.max(1, days)));
    } else if (entry.allDay && hasDate) {
      // "tomorrow": the same time of day, a different day.
      form.start = zonedInstant(entry.start, zonedMinutes(base.start, zone), zone);
      form.end = new Date(form.start.getTime() + length(base));
    } else if (hasTime) {
      const start = new Date(entry.start);
      const end = new Date(entry.end);
      form.allDay = false;
      if (hasDate) {
        form.start = start;
        form.end = end;
      } else {
        // The slot's day as shown, at the typed time in its own zone ("9am EST").
        const timeZone = entry.timeZone ?? zone;
        const day = zonedDayKey(base.start, zone);
        form.start = zonedInstant(day, zonedMinutes(start, timeZone), timeZone);
        form.end = new Date(form.start.getTime() + (end.getTime() - start.getTime()));
      }
    } else if (!entry.allDay && has("duration")) {
      form.end = new Date(base.start.getTime() + length({ start: entry.start, end: entry.end }));
    }
    if (has("all_day") && !has("date_range")) {
      // "all day": the shown day (or the typed one) as floating local-midnight bounds,
      // like the all-day switch, not the slot's instants reread as dates.
      const day = hasDate ? entry.start.slice(0, 10) : zonedDayKey(base.start, zone);
      form.allDay = true;
      form.start = fromDayKey(day);
      form.end = fromDayKey(addDays(day, 1));
    }
    if (entry.location !== undefined) form.location = entry.location;
    // Invitees can't be added on the Mac, so they're kept in the notes, as Quick Entry does.
    if (entry.attendees?.length) {
      const line = `With ${entry.attendees.join(", ")}`;
      // Notes edited by hand hold the line already; a reparse mustn't add it again.
      const present = base.notes.split("\n").includes(line);
      form.notes = !base.notes ? line : present ? base.notes : `${base.notes}\n${line}`;
    }
    if (entry.url !== undefined) form.url = entry.url;
    if (entry.alertsMin !== undefined) form.alarms = entry.alertsMin;
    if (entry.rrule !== undefined) form.recurrence = entry.rrule;
    if (entry.timeZone !== undefined) form.timeZone = entry.timeZone;
    if (entry.calendarId !== undefined) form.calendarId = entry.calendarId;
    return form;
  }
  if (entry.start_at) {
    const start = new Date(entry.start_at);
    const day = hasDate ? zonedDayKey(start, zone) : zonedDayKey(base.start, zone);
    form.start = zonedInstant(day, zonedMinutes(start, zone), zone);
    form.end = new Date(
      form.start.getTime() + (entry.estimate_min ?? length(base) / MINUTE) * MINUTE,
    );
  } else if (entry.when_date && hasDate) {
    form.start = zonedInstant(entry.when_date, zonedMinutes(base.start, zone), zone);
    form.end = new Date(form.start.getTime() + length(base));
  } else if (entry.estimate_min !== undefined) {
    form.end = new Date(base.start.getTime() + entry.estimate_min * MINUTE);
  }
  if (entry.deadline !== undefined) form.deadline = entry.deadline;
  if (entry.project_uuid !== undefined) form.projectUuid = entry.project_uuid;
  if (entry.rrule !== undefined) form.recurrence = entry.rrule;
  return form;
}

// The calendar new events go to: the device setting, else the first writable one.
export function defaultCalendar(
  calendars: readonly DeviceCalendar[],
  preferred: string | null,
): DeviceCalendar | undefined {
  const writable = calendars.filter((calendar) => calendar.writable);
  return writable.find((calendar) => calendar.id === preferred) ?? writable[0];
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// All-day events are stored as local midnights, so the day boundaries hold anywhere.
const dayInstant = (day: DayKey) => toOffsetIso(fromDayKey(day));

/** The calendar input a form describes, ready for createEvent or a diff. */
export function toEventInput(form: EventForm, title: string): EventInput {
  const timed = !form.allDay;
  return {
    calendarId: form.calendarId,
    title,
    start: timed ? toOffsetIso(form.start) : dayInstant(toDayKey(form.start)),
    end: timed
      ? toOffsetIso(form.end)
      : dayInstant(addDays(toDayKey(new Date(form.end.getTime() - 1)), 1)),
    allDay: form.allDay,
    location: form.location.trim() || undefined,
    notes: form.notes.trim() || undefined,
    url: form.url.trim() || undefined,
    recurrence: form.recurrence || undefined,
    busy: form.busy,
    timeZone: timed ? form.timeZone : undefined,
    alarms: form.alarms,
  };
}

/**
 * The calendar input a Quick Entry parse describes. All-day entries come as day keys
 * and go out as local midnights with an offset, the only form every calendar accepts.
 */
export function entryInput(
  entry: EventEntry,
  options: { calendarId: string; zone: string; reminder: number | null },
): EventInput {
  const timed = !entry.allDay;
  return {
    calendarId: options.calendarId,
    title: entry.title,
    start: timed ? entry.start : dayInstant(entry.start),
    end: timed ? entry.end : dayInstant(entry.end),
    allDay: entry.allDay,
    location: entry.location,
    url: entry.url,
    // Device calendars can't invite, so typed emails go into the notes.
    notes: entry.attendees?.length ? `With ${entry.attendees.join(", ")}` : undefined,
    recurrence: entry.rrule,
    busy: timed,
    timeZone: timed ? (entry.timeZone ?? options.zone) : undefined,
    alarms: entry.alertsMin ?? (timed && options.reminder !== null ? [options.reminder] : []),
  };
}

// The input an existing event would be recreated from (undoing a delete).
export function inputFromEvent(event: ExternalEvent): EventInput {
  return {
    calendarId: event.calendarId,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    location: event.location,
    notes: event.notes,
    url: event.url,
    recurrence: event.recurrence,
    busy: event.busy,
    timeZone: event.timeZone,
    alarms: event.alarms,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/*
 * An input with its optional fields spelled out: "" for no location, notes, URL or
 * repeat and [] for no reminders. A patch must send these to clear a field, since an
 * absent key leaves it as it was and `undefined` doesn't survive the trip over IPC.
 */
const explicit = (input: EventInput): EventInput => ({
  ...input,
  location: input.location ?? "",
  notes: input.notes ?? "",
  url: input.url ?? "",
  recurrence: input.recurrence ?? "",
  alarms: input.alarms ?? [],
});

const INPUT_KEYS = [
  "calendarId",
  "title",
  "start",
  "end",
  "allDay",
  "location",
  "notes",
  "url",
  "recurrence",
  "busy",
  "timeZone",
  "alarms",
] as const satisfies readonly (keyof EventInput)[];

/** The fields of `next` that differ from `event`, as an update patch; empty when none do. */
export function eventPatch(event: ExternalEvent, next: EventInput): Partial<EventInput> {
  const previous = explicit(inputFromEvent(event));
  const wanted = explicit(next);
  const patch: Partial<EventInput> = {};
  for (const key of INPUT_KEYS) {
    const equal =
      key === "start" || key === "end"
        ? Date.parse(previous[key]) === Date.parse(wanted[key])
        : same(previous[key], wanted[key]);
    if (!equal) Object.assign(patch, { [key]: wanted[key] });
  }
  return patch;
}

// The previous values of the keys `patch` changes, to undo an update.
export function previousValues(event: ExternalEvent, patch: Partial<EventInput>) {
  const previous = explicit(inputFromEvent(event));
  const result: Partial<EventInput> = {};
  for (const key of Object.keys(patch) as (keyof EventInput)[]) {
    Object.assign(result, { [key]: previous[key] });
  }
  return result;
}

/**
 * What recreates a deleted event when the delete is undone. "this" brings back a
 * one-off at the occurrence's times: EventKit can't return an occurrence to its series,
 * so the series keeps its gap and the copy stands alone. "future" starts the series
 * again from the deleted occurrence, with a COUNT cut down to the occurrences from
 * there on, and "all" from the series' first occurrence (occurrences that had been
 * edited on their own come back as plain repeats).
 */
export function restoreInput(event: ExternalEvent, span: EventSpan): EventInput {
  const input = inputFromEvent(event);
  if (span === "this") return { ...input, recurrence: undefined };
  if (span === "all") {
    return { ...input, start: event.seriesStart ?? event.start, end: event.seriesEnd ?? event.end };
  }
  return { ...input, recurrence: remainingRule(event) };
}

// The series' rule as it continues from `event`: a COUNT less the occurrences before it.
function remainingRule(event: ExternalEvent) {
  const rule = event.recurrence;
  if (!rule || !event.seriesStart || !event.seriesEnd) return rule;
  const count = ruleCount(rule);
  if (count === undefined) return rule;
  // Counted on the event zone's wall clock (expandRule works in local wall time), so a
  // DST change on this device can't shift occurrences across the deleted one.
  const zone = event.timeZone ?? deviceZone;
  const wall = (instant: Date) => atMinute(zonedDayKey(instant, zone), zonedMinutes(instant, zone));
  const seriesStart = wall(new Date(event.seriesStart));
  const seriesEnd = new Date(
    seriesStart.getTime() + Date.parse(event.seriesEnd) - Date.parse(event.seriesStart),
  );
  const target = wall(new Date(event.start));
  const horizon = daysBetween(toDayKey(seriesStart), toDayKey(target)) + 1;
  const before = expandRule(rule, seriesStart, seriesEnd, horizon).filter(
    (occurrence) => occurrence.start.getTime() < target.getTime(),
  ).length;
  return withCount(rule, Math.max(1, count - before));
}

/*
 * Ids of events that came back under a new id: one recreated by undoing a delete, or
 * an occurrence detached from its series by a "this event" edit. A History step takes
 * a reference to the id it was recorded with and resolves it here before acting, so
 * undoing an edit made before the id changed still reaches the event. One log per
 * History, shared by every writer made for it.
 *
 * Renames are a log, and a reference only follows the ones made after it was taken.
 * Calendars reuse ids (a series moved a day gives Tuesday's occurrence Wednesday's
 * old id), so a fresh id and an older step's id can be the same text yet name
 * different events.
 *
 * Occurrence ids are `<identifier>|<original start>`, the identifier shared by a
 * series. A series recreated with the same times is aliased as a whole: every
 * `old|start` becomes `new|start`, so each occurrence keeps its identity. A "future"
 * restore applies only from the deleted occurrence on; the earlier ones stay under
 * the old identifier. A series moved by an "all" edit is aliased as a whole too, every
 * start moved alike on the wall clock. Starts compare as instants, since a calendar can
 * spell one two ways.
 */
const aliasesFor = new WeakMap<History, EventAliases>();

type Alias =
  | { from: string; to: string }
  // Occurrences of `series` starting at `since` or later are now under identifier `to`,
  // their starts moved by `move` when the series' times changed.
  | { series: string; to: string; since: number; move?: (instant: Date) => Date }
  // Every occurrence of `collapse` is now the one event `to`: its repeat was cleared.
  | { collapse: string; to: string };

// The event an id named when the reference was taken: `at` is the log's length then.
interface EventRef {
  id: string;
  at: number;
}

class EventAliases {
  private readonly log: Alias[] = [];

  // A reference to the event that has `id` now.
  ref(id: string): EventRef {
    return { id, at: this.log.length };
  }
  // The id the referenced event has now: every rename since the reference, in order.
  current(ref: EventRef): string {
    let current = ref.id;
    for (const alias of this.log.slice(ref.at)) {
      if ("from" in alias) {
        if (sameId(current, alias.from)) current = alias.to;
        continue;
      }
      const [identifier, start] = splitId(current);
      if ("collapse" in alias) {
        if (identifier === alias.collapse && start) current = alias.to;
        continue;
      }
      if (identifier === alias.series && start && Date.parse(start) >= alias.since) {
        const moved = alias.move ? toOffsetIso(alias.move(new Date(start))) : start;
        current = `${alias.to}|${moved}`;
      }
    }
    return current;
  }
  // Records that the event at `from` is now at `to`; returns the entry's place in the log.
  renamed(from: string, to: string) {
    if (from === to) return undefined;
    return this.log.push({ from, to }) - 1;
  }
  // Records that the series of occurrence `id` became the one event `to`; returns the
  // entry's place in the log, for `restored`.
  collapsed(id: string, to: string) {
    const [identifier, start] = splitId(id);
    if (!start) return this.renamed(id, to);
    return this.log.push({ collapse: identifier, to }) - 1;
  }
  /*
   * Turns the collapse at `index` into a rename of its series to `identifier`, for the
   * references taken before it: a restored repeat gives each occurrence its own id
   * back, while the one event left stays a different event to later references.
   */
  restored(index: number, identifier: string) {
    const alias = this.log[index];
    if (!alias || !("collapse" in alias)) return;
    this.log[index] = { series: alias.collapse, to: identifier, since: Number.NEGATIVE_INFINITY };
  }
  /*
   * Records that the event `from` came back as `created`: a series under a new
   * identifier (from the occurrence at `since` on, else from its first), a one-off
   * under a new id.
   */
  recreated(from: string, created: ExternalEvent, since?: number) {
    const [identifier, start] = splitId(from);
    const [next, nextStart] = splitId(created.id);
    if (!start || !nextStart || !created.recurring) {
      this.renamed(from, created.id);
      return;
    }
    if (identifier === next) return;
    this.log.push({ series: identifier, to: next, since: since ?? Number.NEGATIVE_INFINITY });
  }
  // Records that the occurrences of series `identifier` from `since` on are now under
  // `to`, each moved by `move`: a moved series, or the part a "future" edit split off.
  moved(
    identifier: string,
    move: ((instant: Date) => Date) | undefined,
    to = identifier,
    since = Number.NEGATIVE_INFINITY,
  ) {
    if (!move && to === identifier) return;
    this.log.push({ series: identifier, to, since, move });
  }
}

/*
 * `from` → `to` as a move on `zone`'s wall clock: whole days plus a change of clock time.
 * A calendar re-expands a moved series this way, so each occurrence keeps its clock
 * time across a DST change rather than moving by the same number of hours.
 */
function wallMove(from: Date, to: Date, zone: string) {
  const days = daysBetween(zonedDayKey(from, zone), zonedDayKey(to, zone));
  const minutes = zonedMinutes(to, zone) - zonedMinutes(from, zone);
  return (instant: Date) =>
    zonedInstant(
      addDays(zonedDayKey(instant, zone), days),
      zonedMinutes(instant, zone) + minutes,
      zone,
    );
}

// Whether two ids name the same event: the same identifier, and starts at one instant.
function sameId(a: string, b: string) {
  if (a === b) return true;
  const [identifier, start] = splitId(a);
  const [other, otherStart] = splitId(b);
  return (
    identifier === other &&
    start !== undefined &&
    otherStart !== undefined &&
    Date.parse(start) === Date.parse(otherStart)
  );
}

// An occurrence id's identifier and original start; a one-off has no start.
function splitId(id: string): [identifier: string, start?: string] {
  const bar = id.indexOf("|");
  return bar < 0 ? [id] : [id.slice(0, bar), id.slice(bar + 1)];
}

function eventAliases(history: History) {
  const aliases = aliasesFor.get(history) ?? new EventAliases();
  aliasesFor.set(history, aliases);
  return aliases;
}

/**
 * Undoable writes to device calendars. Each call is one History step: ⌘Z reverses it
 * (a created event is deleted, an edit gets its previous values, a deleted event is
 * recreated under a new id) and ⇧⌘Z applies it again. `refresh` reloads the grid,
 * since fixture calendars never report changes.
 */
export function eventWriter(
  history: History,
  refresh: () => Promise<void>,
  api: CalendarSource = window.cal.calendar,
) {
  const ids = eventAliases(history);
  return {
    create(input: EventInput) {
      let ref: EventRef | undefined;
      return history.transact("New Event", async (tx) => {
        await tx.external(
          async () => {
            const created = await api.createEvent(input);
            // A redo creates it again under a new id; later steps still hold the old one.
            if (ref) ids.recreated(ids.current(ref), created);
            ref = ids.ref(created.id);
            await refresh();
          },
          async () => {
            // A repeating event was created as a whole series, so it goes as one.
            if (ref) await api.deleteEvent(ids.current(ref), input.recurrence ? "all" : "this");
            await refresh();
          },
        );
        return ref && ids.current(ref);
      });
    },
    update(
      event: ExternalEvent,
      patch: Partial<EventInput>,
      span: EventSpan,
      label = "Edit Event",
    ) {
      const ref = ids.ref(event.id);
      const previous = previousValues(event, patch);
      // Clearing a repeat with new times keeps the series' first occurrence, moved like
      // the picked one; the undo puts it back at the first occurrence's times.
      if (span === "all" && patch.recurrence === "" && event.recurring && event.seriesStart) {
        if (patch.start !== undefined) previous.start = event.seriesStart;
        if (patch.end !== undefined && event.seriesEnd) previous.end = event.seriesEnd;
      }
      // A repeat given to a one-off made a whole series; taking it back is an "all" edit.
      const undoSpan: EventSpan =
        span === "this" && patch.recurrence && !event.recurring && !event.recurrence ? "all" : span;
      // The log entry of the collapse an "all" write that cleared the repeat made.
      let collapse: number | undefined;
      // `from` is the occurrence's start before the write, the other side's start.
      const place = async (input: Partial<EventInput>, span: EventSpan, from?: string) => {
        const id = ids.current(ref);
        const written = await api.updateEvent(id, input, span);
        if (span === "all" && !written.recurring) {
          // Clearing the repeat leaves one event, whichever occurrence was picked.
          collapse = ids.collapsed(id, written.id);
          await refresh();
          return;
        }
        // The repeat is back (by whatever span), and with it each occurrence's own id:
        // under a new identifier when the one event was deleted and recreated in between.
        const restored = collapse !== undefined && written.recurring;
        if (collapse !== undefined && restored) ids.restored(collapse, splitId(written.id)[0]);
        collapse = undefined;
        const [identifier, start] = splitId(id);
        // How new times move each occurrence of the span.
        const move =
          input.start && from && Date.parse(input.start) !== Date.parse(from)
            ? wallMove(new Date(from), new Date(input.start), event.timeZone ?? deviceZone)
            : undefined;
        if (span === "future" && start && written.recurring && !restored) {
          // "This and following" splits the series: those occurrences go to the written
          // identifier, each moved alike.
          ids.moved(identifier, move, splitId(written.id)[0], Date.parse(start));
        } else if (span !== "all") {
          // A "this event" edit detaches the occurrence, which can give it a new id.
          ids.renamed(id, written.id);
        } else {
          // A one-off given a rule is its series' first occurrence.
          if (!start) ids.renamed(id, written.id);
          // New times rename every occurrence by its new start, each moved alike.
          // A one-off given a rule or a restored repeat is written at its new start already.
          if (start && !restored) ids.moved(identifier, move);
          // A new rule can drop this occurrence; the calendar answers with one it kept.
          if (start && !restored && input.recurrence !== undefined && !input.start) {
            ids.renamed(id, written.id);
          }
        }
        await refresh();
      };
      return history.transact(label, (tx) =>
        tx.external(
          () => place(patch, span, previous.start),
          () => place(previous, undoSpan, patch.start),
        ),
      );
    },
    remove(event: ExternalEvent, span: EventSpan) {
      const ref = ids.ref(event.id);
      const input = restoreInput(event, span);
      return history.transact("Delete Event", (tx) =>
        tx.external(
          async () => {
            await api.deleteEvent(ids.current(ref), span);
            await refresh();
          },
          async () => {
            // Deleted events can't come back under their old id; the undo recreates one.
            const created = await api.createEvent(input);
            const id = ids.current(ref);
            const since = span === "future" ? Date.parse(splitId(id)[1] ?? event.start) : undefined;
            ids.recreated(id, created, since);
            await refresh();
          },
        ),
      );
    },
  };
}

export type EventWriter = ReturnType<typeof eventWriter>;

/**
 * Deletes `event` as an undoable step and offers Undo in a toast. The offer is for
 * that step alone: once another step lands (or the delete is undone some other way)
 * the toast goes, so Undo never reverses something else. Shared with the grid's ⌫.
 */
export async function deleteWithUndo(
  event: ExternalEvent,
  span: EventSpan,
  writer: EventWriter,
  history: History,
) {
  try {
    await writer.remove(event, span);
  } catch (error) {
    showToast(`Couldn't delete the event: ${error instanceof Error ? error.message : error}`);
    return;
  }
  const id = showToast(`Deleted “${event.title}”`, {
    label: "Undo",
    run: () => void history.undo(),
  });
  const stop = history.subscribe(() => {
    stop();
    dismissToast(id);
  });
}

/*
 * The span question for repeating events. `askSpan` resolves with the user's choice,
 * or null when the dialog is dismissed; the SpanDialog component renders `pending`.
 */
export interface SpanQuestion {
  title: string;
  options: readonly EventSpan[];
  resolve: (span: EventSpan | null) => void;
}

export const spanStore = createStore<{ pending: SpanQuestion | null }>({ pending: null });

export const useSpanQuestion = () => useStore(spanStore, (state) => state.pending);

export function askSpan(title: string, options: readonly EventSpan[] = ["this", "future", "all"]) {
  return new Promise<EventSpan | null>((resolve) => {
    spanStore.set({
      pending: {
        title,
        options,
        resolve: (span) => {
          spanStore.set({ pending: null });
          resolve(span);
        },
      },
    });
  });
}

// A repeating occurrence needs the question; a one-off event is always "this".
export const spanFor = (event: ExternalEvent, title: string, options?: readonly EventSpan[]) =>
  event.recurring || event.recurrence
    ? askSpan(title, options)
    : Promise.resolve<EventSpan>("this");

/**
 * The first `minutes`-long slot on or after `from` (rounded up to the quarter hour)
 * that overlaps none of `busy`, for `C` with nothing selected.
 */
export function nextFreeSlot(
  from: Date,
  minutes: number,
  busy: readonly { start: Date; end: Date }[],
) {
  let start = Math.ceil((from.getTime() + 1) / (15 * MINUTE)) * 15 * MINUTE;
  for (let tries = 0; tries < 96; tries++) {
    const end = start + minutes * MINUTE;
    const clash = busy.find((span) => span.start.getTime() < end && span.end.getTime() > start);
    if (!clash) return { start: new Date(start), end: new Date(end) };
    start = Math.ceil(clash.end.getTime() / (15 * MINUTE)) * 15 * MINUTE;
  }
  return { start: new Date(start), end: new Date(start + minutes * MINUTE) };
}

// The day a form's start falls on: an all-day event's calendar day (stored as a local
// midnight), else the day of its start in the zone its times are typed in.
export const formDay = (form: EventForm) =>
  form.allDay ? toDayKey(form.start) : zonedDayKey(form.start, form.timeZone);

/**
 * The form's end set to `minutes` on the clock. A multi-day event's end stays on its
 * own day; a same-day or overnight one is built on the start's day and wraps past
 * midnight when it lands at or before the start.
 */
export function endAtMinutes(form: EventForm, minutes: number) {
  const day = formDay(form);
  const endDay = zonedDayKey(form.end, form.timeZone);
  // A day or more long, or across two midnights (shorter than a day over spring DST):
  // the end keeps its own date. Otherwise it's a same-day or overnight event, rebuilt
  // from the start's day and wrapped past midnight.
  const multiDay = form.end.getTime() - form.start.getTime() >= DAY || daysBetween(day, endDay) > 1;
  const base = multiDay ? endDay : day;
  const end = zonedInstant(base, minutes, form.timeZone);
  // Wrapped onto the next calendar day, so the typed clock time holds across DST.
  return end.getTime() <= form.start.getTime()
    ? zonedInstant(addDays(base, 1), minutes, form.timeZone)
    : end;
}

/**
 * The form's times with the start on `day`: an all-day span keeps its number of
 * calendar days (not its milliseconds, which a DST change would stretch), a timed one
 * its time of day and length.
 */
export function movedToDay(form: EventForm, day: DayKey) {
  if (form.allDay) {
    const last = toDayKey(new Date(form.end.getTime() - 1));
    const days = daysBetween(toDayKey(form.start), last) + 1;
    return { start: fromDayKey(day), end: fromDayKey(addDays(day, days)) };
  }
  const start = zonedInstant(day, zonedMinutes(form.start, form.timeZone), form.timeZone);
  return { start, end: new Date(start.getTime() + form.end.getTime() - form.start.getTime()) };
}

/**
 * What the Date field's text sets, if it names a date: a range on an all-day event sets
 * both ends; a single date moves the event, keeping its time of day and length.
 */
export function datePatch(form: EventForm, parsed: QuickEntry) {
  if (parsed.kind !== "event") return undefined;
  const applied = (kind: TokenKind) => parsed.tokens.some((t) => t.applied && t.kind === kind);
  if (!applied("when") && !applied("date_range")) return undefined;
  if (form.allDay && parsed.allDay && applied("date_range")) {
    return { start: fromDayKey(parsed.start), end: fromDayKey(parsed.end) };
  }
  const day = parsed.allDay ? parsed.start : zonedDayKey(new Date(parsed.start), form.timeZone);
  return movedToDay(form, day);
}

/**
 * The to-do a task form saves: what the title parsed (a new draft's tokens), under the
 * form's fields. Those win even when cleared, so a deadline or project the parse found
 * and the user then removed stays removed.
 */
export function taskEntry(form: EventForm, typed: TaskEntry | null, title: string): TaskEntry {
  return {
    ...(typed ?? { kind: "task", tokens: [] }),
    kind: "task",
    title,
    when: "date",
    when_date: formDay(form),
    start_at: toOffsetIso(form.start),
    estimate_min: Math.round((form.end.getTime() - form.start.getTime()) / MINUTE),
    deadline: form.deadline ?? undefined,
    project_uuid: form.projectUuid ?? undefined,
  };
}
