import type {
  CalendarAccess,
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
  expandRule,
  startOfWeek,
  toDayKey,
  toOffsetIso,
} from "@cal/domain";
import type { LocalStore, NewRow } from "@cal/sync";

/*
 * Fixed data for screenshots and design review (`CAL_FIXTURE=1`): the same week, the
 * same tasks and the same clock (Wednesday 2026-10-28, 10:40) every run, so screens
 * can be compared round to round.
 */
export const FIXTURE_NOW = new Date(2026, 9, 28, 10, 40);

const today = toDayKey(FIXTURE_NOW);
const monday = startOfWeek(today);
const day = (offset: number) => addDays(monday, offset);
const at = (key: DayKey, hour: number, minute = 0) => atMinute(key, hour * 60 + minute);

const calendars: DeviceCalendar[] = [
  { id: "work", title: "Work", color: "#3b82f6", account: "me@work.com", writable: true },
  { id: "personal", title: "Personal", color: "#22a06b", account: "iCloud", writable: true },
  { id: "family", title: "Family", color: "#e5484d", account: "iCloud", writable: true },
  { id: "holidays", title: "Holidays", color: "#8e4ec6", account: "Subscribed", writable: false },
];

/*
 * A fixture event: an ExternalEvent plus the series it belongs to, so "this and
 * following" and "all events" can reach the other occurrences. Occurrence ids follow
 * EventKit's shape, `<identifier>|<original start>`, with the series' identifier in
 * front; a one-off's id is just its identifier.
 */
type Stored = ExternalEvent & { series?: string };

const occurrenceId = (series: string, start: Date) => `${series}|${toOffsetIso(start)}`;

// The identifier before the "|" of an occurrence id (the whole id for a one-off).
const identifierOf = (id: string) => id.split("|")[0] ?? id;

type Seed = [calendarId: string, title: string, start: Date, end: Date, extra?: Partial<Stored>];

// Every weekday's Standup is one occurrence of the same series, with reminders.
const standup: Partial<Stored> = {
  series: "standup",
  recurring: true,
  recurrence: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  alarms: [10, 60],
  timeZone: "America/Los_Angeles",
};

const seeds: Seed[] = [
  ["work", "Standup", at(day(0), 9, 30), at(day(0), 9, 45), standup],
  ["work", "Standup", at(day(1), 9, 30), at(day(1), 9, 45), standup],
  ["work", "Standup", at(day(2), 9, 30), at(day(2), 9, 45), standup],
  ["work", "Standup", at(day(3), 9, 30), at(day(3), 9, 45), standup],
  ["work", "Standup", at(day(4), 9, 30), at(day(4), 9, 45), standup],
  ["work", "Planning", at(day(0), 11), at(day(0), 12), { location: "Room 4" }],
  [
    "work",
    "Design review",
    at(day(1), 14),
    at(day(1), 15, 30),
    {
      url: "https://meet.google.com/abc-defg-hij",
      attendees: [
        { name: "Priya Nair", email: "priya@work.com", status: "accepted", organizer: true },
        { name: "Sam Okafor", email: "sam@work.com", status: "tentative", organizer: false },
        { email: "lee@work.com", status: "pending", organizer: false },
      ],
      myStatus: "accepted",
    },
  ],
  ["work", "1:1 with Sam", at(day(2), 11, 30), at(day(2), 12)],
  ["work", "Prep for All Hands", at(day(2), 13), at(day(2), 13, 30)],
  ["work", "All Hands", at(day(2), 16), at(day(2), 17), { location: "Zoom" }],
  ["work", "Interview: frontend", at(day(3), 10), at(day(3), 11)],
  ["work", "Interview: frontend", at(day(3), 10, 30), at(day(3), 11, 30)],
  ["work", "Retro", at(day(4), 15), at(day(4), 16)],
  ["personal", "Gym", at(day(0), 7), at(day(0), 8)],
  ["personal", "Gym", at(day(2), 7), at(day(2), 8)],
  ["personal", "Lunch with Priya", at(day(3), 12, 30), at(day(3), 13, 30)],
  ["personal", "Dentist", at(day(4), 8), at(day(4), 9)],
  ["family", "Dinner at Mom's", at(day(5), 18), at(day(5), 20)],
  ["family", "Soccer", at(day(6), 10), at(day(6), 11, 30)],
  ["holidays", "Halloween", at(day(4), 0), at(day(5), 0), { allDay: true }],
  ["personal", "Trip to Tahoe", at(day(5), 0), at(day(7), 0), { allDay: true }],
];

const seeded: Stored[] = seeds.map(([calendarId, title, start, end, extra], index) => ({
  id: extra?.series ? occurrenceId(extra.series, start) : `fixture-${index}`,
  calendarId,
  title,
  start: toOffsetIso(start),
  end: toOffsetIso(end),
  allDay: false,
  recurring: false,
  busy: true,
  ...extra,
}));

// Device calendars for fixture mode: fixed, read-mostly, in memory.
export class FixtureCalendar implements CalendarSource {
  // Each instance edits its own copy, so tests and scenes never see each other's changes.
  private readonly stored: Stored[] = seeded.map((event) => ({ ...event }));
  // Ids never repeat, so an undo that recreates a deleted event gets a fresh one.
  private nextId = seeded.length;

  async access(): Promise<CalendarAccess> {
    return "fullAccess";
  }
  async requestAccess(): Promise<CalendarAccess> {
    return "fullAccess";
  }
  async calendars() {
    return calendars;
  }
  async events(start: string, end: string, calendarIds?: readonly string[]) {
    const from = Date.parse(start);
    const to = Date.parse(end);
    return this.stored
      .filter(
        (event) =>
          Date.parse(event.end) > from &&
          Date.parse(event.start) < to &&
          (!calendarIds || calendarIds.includes(event.calendarId)),
      )
      .map((event) => this.publish(event));
  }

  // A repeating event is stored as one occurrence per date, all in one series.
  async createEvent(input: EventInput) {
    const identifier = `fixture-${this.nextId++}`;
    const start = new Date(input.start);
    const end = new Date(input.end);
    const [first] = input.recurrence ? expandRule(input.recurrence, start, end) : [{ start, end }];
    if (!first) throw new Error("rule has no occurrences");
    const created: Stored = {
      busy: true,
      ...input,
      ...blankToUndefined(input),
      id: input.recurrence ? occurrenceId(identifier, first.start) : identifier,
      start: toOffsetIso(first.start),
      end: toOffsetIso(first.end),
      recurring: Boolean(input.recurrence),
      recurrence: input.recurrence || undefined,
      series: input.recurrence ? identifier : undefined,
    };
    this.stored.push(created);
    this.expand(created);
    return this.publish(created);
  }

  /*
   * "this" changes one occurrence, "future" this and the later ones (which become a
   * series of their own), "all" the whole series; new times shift each occurrence by
   * the same amount. A changed repeat keeps the span's first occurrence and drops the
   * rest: a cleared rule leaves it alone, a new rule expands again from it. The answer
   * is the occurrence `id` names, or the kept one when `id` was dropped.
   */
  async updateEvent(id: string, input: Partial<EventInput>, span: EventSpan) {
    const current = this.stored.find((event) => event.id === id);
    if (!current) throw new Error(`no event ${id}`);
    const members = this.members(current, span);
    const retained = input.recurrence === undefined ? members : members.slice(0, 1);
    for (const member of members) if (!retained.includes(member)) this.drop(member);
    const series = span === "future" && current.series ? `fixture-${this.nextId++}` : undefined;
    const shift = (key: "start" | "end", time: string) =>
      Date.parse(time) - Date.parse(current[key]);
    let written: Stored | undefined;
    for (const member of retained) {
      const next: Stored = { ...member, ...input, ...blankToUndefined(input) };
      if (input.start)
        next.start = toOffsetIso(new Date(Date.parse(member.start) + shift("start", input.start)));
      if (input.end)
        next.end = toOffsetIso(new Date(Date.parse(member.end) + shift("end", input.end)));
      // Like a device calendar, a series' occurrences are named by their start: moving
      // the series renames each one. A detached ("this") occurrence keeps its name.
      if (input.start && span !== "this" && next.series && next.id.includes("|"))
        next.id = occurrenceId(next.series, new Date(next.start));
      if (input.recurrence !== undefined) {
        next.recurrence = input.recurrence || undefined;
        next.recurring = Boolean(input.recurrence);
        next.series = input.recurrence ? (next.series ?? identifierOf(next.id)) : undefined;
        // Like a device calendar, the one event a cleared repeat leaves has a plain id.
        if (!next.series) next.id = identifierOf(next.id);
        // A one-off given a rule becomes its series' first occurrence.
        if (next.series && !next.id.includes("|"))
          next.id = occurrenceId(next.series, new Date(next.start));
      }
      if (series && next.series) next.series = series;
      this.stored[this.stored.indexOf(member)] = next;
      if (input.recurrence) this.expand(next);
      if (member === current || !written) written = next;
    }
    if (!written) throw new Error(`no event ${id}`);
    return this.publish(written);
  }
  async deleteEvent(id: string, span: EventSpan) {
    const current = this.stored.find((event) => event.id === id);
    if (!current) return;
    for (const member of this.members(current, span)) this.drop(member);
  }
  onChange() {
    return () => {};
  }

  // The occurrences a span covers, from `current`, earliest first.
  private members(current: Stored, span: EventSpan) {
    if (span === "this" || !current.series) return [current];
    const from = span === "future" ? Date.parse(current.start) : Number.NEGATIVE_INFINITY;
    return this.stored
      .filter((event) => event.series === current.series && Date.parse(event.start) >= from)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
  // Adds the occurrences that follow `first` under its rule, skipping any already stored.
  private expand(first: Stored) {
    if (!first.recurrence || !first.series) return;
    const times = expandRule(first.recurrence, new Date(first.start), new Date(first.end));
    for (const time of times.slice(1)) {
      const id = occurrenceId(first.series, time.start);
      if (this.stored.some((event) => event.id === id)) continue;
      this.stored.push({
        ...first,
        id,
        start: toOffsetIso(time.start),
        end: toOffsetIso(time.end),
      });
    }
  }
  private drop(event: Stored) {
    this.stored.splice(this.stored.indexOf(event), 1);
  }
  // The event as callers see it: no series key, plus the series' first times.
  private publish({ series, ...event }: Stored): ExternalEvent {
    if (!series) return event;
    const first = this.stored
      .filter((each) => each.series === series)
      .reduce((a, b) => (Date.parse(b.start) < Date.parse(a.start) ? b : a));
    return { ...event, seriesStart: first.start, seriesEnd: first.end };
  }
}

// Empty text or lists mean "cleared", stored as absent like a device calendar reports them.
function blankToUndefined(input: Partial<EventInput>) {
  const cleared: Partial<Record<"location" | "notes" | "url" | "alarms", undefined>> = {};
  for (const key of ["location", "notes", "url"] as const)
    if (input[key] === "") cleared[key] = undefined;
  if (input.alarms?.length === 0) cleared.alarms = undefined;
  return cleared;
}

// Fills an empty store with areas, projects, tasks, blocks and habits for the fixture week.
export function seedFixture(store: LocalStore) {
  if (store.list("tasks").length > 0) return;
  const work = store.insert("areas", { title: "Work", position: 0 });
  const home = store.insert("areas", { title: "Home", position: 1 });
  const launch = store.insert("projects", {
    title: "Launch v2",
    area_uuid: work,
    position: 0,
    deadline: day(4),
  });
  const move = store.insert("projects", { title: "Move apartments", area_uuid: home, position: 1 });

  const task = (title: string, fields: Partial<NewRow<"tasks">> = {}) =>
    store.insert("tasks", { title, position: 0, when: "inbox", ...fields });

  task("Reply to Alex about the offsite", { position: 0 });
  task("Look into standing desks", { position: 1 });
  task("Book flights for December", { position: 2, estimate_min: 30 });
  const spec = task("Write launch spec", {
    project_uuid: launch,
    when: "date",
    when_date: today,
    estimate_min: 180,
    priority: 1,
    deadline: day(3),
    position: 0,
  });
  task("Review Sam's PR", {
    project_uuid: launch,
    when: "date",
    when_date: today,
    estimate_min: 45,
    priority: 2,
    position: 1,
  });
  task("Update pricing page copy", {
    project_uuid: launch,
    when: "date",
    when_date: day(1),
    estimate_min: 60,
    deadline: day(4),
    position: 2,
  });
  task("Pay rent", {
    area_uuid: home,
    when: "date",
    when_date: day(0),
    deadline: day(1),
    position: 3,
  });
  task("Call the movers", {
    project_uuid: move,
    when: "evening",
    when_date: today,
    position: 4,
    estimate_min: 20,
  });
  task("Pack the bookshelf", {
    project_uuid: move,
    when: "date",
    when_date: day(5),
    estimate_min: 90,
  });
  task("Learn to make sourdough", { when: "someday" });
  task("Read 'The Making of Prince of Persia'", { when: "anytime", estimate_min: 60 });
  task("Renew passport", { when: "anytime", area_uuid: home, deadline: day(16) });
  const done = task("Draft launch announcement", {
    project_uuid: launch,
    when: "date",
    when_date: day(0),
  });
  store.update("tasks", done, { completed_at: at(day(0), 16).getTime() });

  const block = (taskUuid: string, start: Date, end: Date, doneAt?: number) =>
    store.insert("time_blocks", {
      task_uuid: taskUuid,
      start_at: toOffsetIso(start),
      end_at: toOffsetIso(end),
      time_zone: "America/Los_Angeles",
      source: "manual",
      done_at: doneAt,
    });
  block(spec, at(day(1), 9, 45), at(day(1), 11, 15), at(day(1), 11, 15).getTime());
  block(spec, at(day(2), 14), at(day(2), 15, 30));
  block(done, at(day(0), 14), at(day(0), 15, 30), at(day(0), 15, 30).getTime());

  const gym = store.insert("habits", {
    title: "Gym",
    kind: "check",
    schedule: "quota",
    quota_count: 3,
    quota_period: "week",
    display: "strip",
    position: 0,
  });
  const read = store.insert("habits", {
    title: "Read",
    kind: "measure",
    target: 20,
    unit: "min",
    schedule: "fixed",
    rrule: "FREQ=DAILY",
    display: "strip",
    position: 1,
  });
  store.insert("habits", {
    title: "Meditate",
    kind: "check",
    schedule: "fixed",
    rrule: "FREQ=DAILY",
    display: "strip",
    position: 2,
  });
  for (const offset of [0, 2]) {
    store.insert("habit_entries", {
      habit_uuid: gym,
      date: day(offset),
      value: 1,
      source: "calendar",
    });
  }
  for (const [offset, minutes] of [
    [-2, 25],
    [-1, 20],
    [0, 30],
    [1, 15],
  ] as const) {
    store.insert("habit_entries", {
      habit_uuid: read,
      date: day(offset),
      value: minutes,
      source: "manual",
    });
  }
}
