import type { History } from "@cal/app-core";
import type {
  CalendarSource,
  DeviceCalendar,
  EventInput,
  EventSpan,
  ExternalEvent,
} from "@cal/calendar-source";
import { addDays, type DayKey, fromDayKey, toDayKey, toOffsetIso } from "@cal/domain";
import type { QuickEntry, TokenKind } from "@cal/nlp";
import type { Literal } from "./entryText";
import { createStore, useStore } from "./store";
import { zonedDayKey, zonedInstant, zonedMinutes } from "./zones";

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
  editorStore.set({ editor: { mode: "create", anchor: "draft", dirty: false, base: form, form } });
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
    editor: { mode: "edit", event, anchor: `event:${event.id}`, dirty: false, base: form, form },
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
          },
        }
      : {},
  );
  if (patch.kind) lastKind = patch.kind;
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

const length = (form: Pick<EventForm, "start" | "end">) =>
  form.end.getTime() - form.start.getTime();

/**
 * `base` with the fields a parse set laid over it. A date token moves the day and keeps
 * the slot's time; a time token sets the time and keeps the slot's day unless the text
 * named one; "all day" and date ranges make it all-day. Fields the text didn't mention
 * stay as they are, so un-parsing a token restores the slot.
 */
export function applyEntry(base: EventForm, entry: QuickEntry): EventForm {
  const has = (kind: TokenKind) => entry.tokens.some((t) => t.applied && t.kind === kind);
  const zone = base.timeZone;
  const hasDate = has("when") || has("date_range");
  const hasTime = has("time") || has("time_range");
  const form = { ...base };
  if (entry.kind === "event") {
    if (has("date_range")) {
      form.allDay = true;
      form.start = fromDayKey(entry.start);
      form.end = fromDayKey(entry.end);
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
        const day = zonedDayKey(base.start, zone);
        form.start = zonedInstant(day, zonedMinutes(start, zone), zone);
        form.end = new Date(form.start.getTime() + (end.getTime() - start.getTime()));
      }
    }
    if (has("all_day")) form.allDay = true;
    if (entry.location !== undefined) form.location = entry.location;
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
 * again from the deleted occurrence and "all" from the series' first occurrence (a
 * COUNT starts over, and occurrences that had been edited on their own come back as
 * plain repeats).
 */
export function restoreInput(event: ExternalEvent, span: EventSpan): EventInput {
  const input = inputFromEvent(event);
  if (span === "this") return { ...input, recurrence: undefined };
  if (span === "all") {
    return { ...input, start: event.seriesStart ?? event.start, end: event.seriesEnd ?? event.end };
  }
  return input;
}

/*
 * Ids of events that came back under a new id: one recreated by undoing a delete, or
 * an occurrence detached from its series by a "this event" edit. History steps keep
 * the id they were recorded with and resolve it here before acting, so undoing an edit
 * made before the id changed still reaches the event. One map per History, shared by
 * every writer made for it.
 */
const aliasesFor = new WeakMap<History, Map<string, string>>();

function eventAliases(history: History) {
  const aliases = aliasesFor.get(history) ?? new Map<string, string>();
  aliasesFor.set(history, aliases);
  return {
    current(id: string): string {
      let current = id;
      for (let hops = 0; hops < 100; hops++) {
        const next = aliases.get(current);
        if (next === undefined) break;
        current = next;
      }
      return current;
    },
    renamed(from: string, to: string) {
      if (from !== to) aliases.set(from, to);
    },
  };
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
      let id: string | undefined;
      return history.transact("New Event", async (tx) => {
        await tx.external(
          async () => {
            const created = await api.createEvent(input);
            // A redo creates it again under a new id; later steps still hold the old one.
            if (id) ids.renamed(ids.current(id), created.id);
            id = created.id;
            await refresh();
          },
          async () => {
            // A repeating event was created as a whole series, so it goes as one.
            if (id) await api.deleteEvent(ids.current(id), input.recurrence ? "all" : "this");
            await refresh();
          },
        );
        return id;
      });
    },
    update(
      event: ExternalEvent,
      patch: Partial<EventInput>,
      span: EventSpan,
      label = "Edit Event",
    ) {
      const previous = previousValues(event, patch);
      const place = async (input: Partial<EventInput>) => {
        const id = ids.current(event.id);
        const written = await api.updateEvent(id, input, span);
        // A "this event" edit detaches the occurrence, which can give it a new id. An
        // "all" write answers with the series' first occurrence, which isn't this one.
        if (span !== "all") ids.renamed(id, written.id);
        await refresh();
      };
      return history.transact(label, (tx) =>
        tx.external(
          () => place(patch),
          () => place(previous),
        ),
      );
    },
    remove(event: ExternalEvent, span: EventSpan) {
      const input = restoreInput(event, span);
      return history.transact("Delete Event", (tx) =>
        tx.external(
          async () => {
            await api.deleteEvent(ids.current(event.id), span);
            await refresh();
          },
          async () => {
            // Deleted events can't come back under their old id; the undo recreates one.
            const created = await api.createEvent(input);
            ids.renamed(ids.current(event.id), created.id);
            await refresh();
          },
        ),
      );
    },
  };
}

export type EventWriter = ReturnType<typeof eventWriter>;

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

// The day a form's start falls on, in the zone its times are typed in.
export const formDay = (form: EventForm) => zonedDayKey(form.start, form.timeZone);
