import { describe, expect, test } from "bun:test";
import { type ParseContext, parseQuickEntry, type QuickEntry } from "../src";

// Wednesday 2026-10-28 10:40 in Los Angeles (PDT); clocks fall back on Sun Nov 1.
// `bun run test` runs this file with TZ=America/Los_Angeles.
const now = new Date(2026, 9, 28, 10, 40);

const base: ParseContext = {
  now,
  calendars: [
    { id: "cal-work", title: "Work" },
    { id: "cal-home", title: "Home" },
  ],
  projects: [
    { uuid: "p-work", title: "Work" },
    { uuid: "p-errands", title: "Errands" },
  ],
  defaultEventMin: 60,
  weekStartsOn: 1,
};

const quick = (text: string) => parseQuickEntry(text, { ...base, surface: "quick" });
const grid = (text: string) => parseQuickEntry(text, { ...base, surface: "grid" });

// The entry's fields, without tokens, for comparing against the research table.
const fields = (entry: QuickEntry) => {
  const { tokens, ...rest } = entry;
  return rest;
};

// Research/10's table: input, surface, and the exact fields expected.
const table: [number, string, "quick" | "grid", Record<string, unknown>][] = [
  [
    1,
    "Lunch with Sam tomorrow 1pm for 1h",
    "quick",
    {
      kind: "event",
      title: "Lunch with Sam",
      allDay: false,
      start: "2026-10-29T13:00:00-07:00",
      end: "2026-10-29T14:00:00-07:00",
    },
  ],
  [
    2,
    "Lunch with sam@example.com tomorrow 12:30-1:30 at Blue Bottle /home",
    "quick",
    {
      kind: "event",
      title: "Lunch",
      allDay: false,
      start: "2026-10-29T12:30:00-07:00",
      end: "2026-10-29T13:30:00-07:00",
      location: "Blue Bottle",
      calendarId: "cal-home",
      attendees: ["sam@example.com"],
    },
  ],
  [
    3,
    "Design review 1-2pm",
    "quick",
    {
      kind: "event",
      title: "Design review",
      allDay: false,
      start: "2026-10-28T13:00:00-07:00",
      end: "2026-10-28T14:00:00-07:00",
    },
  ],
  [
    4,
    "Call from 3 to 4:30",
    "quick",
    {
      kind: "event",
      title: "Call",
      allDay: false,
      start: "2026-10-28T15:00:00-07:00",
      end: "2026-10-28T16:30:00-07:00",
    },
  ],
  [
    5,
    "Standup at 9",
    "grid",
    {
      kind: "event",
      title: "Standup",
      allDay: false,
      start: "2026-10-29T09:00:00-07:00",
      end: "2026-10-29T10:00:00-07:00",
    },
  ],
  [
    6,
    "Dinner at 7",
    "grid",
    {
      kind: "event",
      title: "Dinner",
      allDay: false,
      start: "2026-10-28T19:00:00-07:00",
      end: "2026-10-28T20:00:00-07:00",
    },
  ],
  [
    7,
    "Pick up kids at 3",
    "quick",
    {
      kind: "task",
      title: "Pick up kids",
      when: "date",
      when_date: "2026-10-28",
      start_at: "2026-10-28T15:00:00-07:00",
    },
  ],
  [
    8,
    "1:1 with Sam at 4",
    "quick",
    {
      kind: "task",
      title: "1:1 with Sam",
      when: "date",
      when_date: "2026-10-28",
      start_at: "2026-10-28T16:00:00-07:00",
    },
  ],
  [
    9,
    "Call mom at 5 tomorrow",
    "quick",
    {
      kind: "task",
      title: "Call mom",
      when: "date",
      when_date: "2026-10-29",
      start_at: "2026-10-29T17:00:00-07:00",
    },
  ],
  [
    10,
    "Call Sam 3pm",
    "quick",
    {
      kind: "task",
      title: "Call Sam",
      when: "date",
      when_date: "2026-10-28",
      start_at: "2026-10-28T15:00:00-07:00",
    },
  ],
  [
    11,
    "Review Friday",
    "quick",
    { kind: "task", title: "Review", when: "date", when_date: "2026-10-30" },
  ],
  [
    12,
    "Review next Friday",
    "quick",
    { kind: "task", title: "Review", when: "date", when_date: "2026-11-06" },
  ],
  [
    13,
    "Call Wednesday",
    "quick",
    { kind: "task", title: "Call", when: "date", when_date: "2026-10-28" },
  ],
  [
    14,
    "Call Wednesday 9am",
    "quick",
    {
      kind: "task",
      title: "Call",
      when: "date",
      when_date: "2026-11-04",
      start_at: "2026-11-04T09:00:00-08:00",
    },
  ],
  [
    15,
    "Review in 2 weeks",
    "quick",
    { kind: "task", title: "Review", when: "date", when_date: "2026-11-11" },
  ],
  [
    16,
    "Plan Q1 next week",
    "quick",
    { kind: "task", title: "Plan Q1", when: "date", when_date: "2026-11-02" },
  ],
  [
    17,
    "Party this weekend",
    "quick",
    { kind: "task", title: "Party", when: "date", when_date: "2026-10-31" },
  ],
  [18, "Sunday school", "quick", { kind: "task", title: "Sunday school" }],
  [
    19,
    "Sunday school this Sunday 9am",
    "quick",
    {
      kind: "task",
      title: "Sunday school",
      when: "date",
      when_date: "2026-11-01",
      start_at: "2026-11-01T09:00:00-08:00",
    },
  ],
  [
    20,
    "March for Science on Saturday",
    "quick",
    { kind: "task", title: "March for Science", when: "date", when_date: "2026-10-31" },
  ],
  [21, "Buy May flowers", "quick", { kind: "task", title: "Buy May flowers" }],
  [22, "Read chapter 3", "quick", { kind: "task", title: "Read chapter 3" }],
  [
    23,
    '"Prepare for Wacky Wednesday" on Tuesday at 9pm',
    "grid",
    {
      kind: "event",
      title: "Prepare for Wacky Wednesday",
      allDay: false,
      start: "2026-11-03T21:00:00-08:00",
      end: "2026-11-03T22:00:00-08:00",
    },
  ],
  [
    24,
    "Offsite all day Friday /work",
    "quick",
    {
      kind: "event",
      title: "Offsite",
      allDay: true,
      start: "2026-10-30",
      end: "2026-10-31",
      calendarId: "cal-work",
    },
  ],
  [
    25,
    "Trip next Tue–Thu",
    "quick",
    { kind: "event", title: "Trip", allDay: true, start: "2026-11-03", end: "2026-11-06" },
  ],
  [
    26,
    "Family vacation from Aug 9-18",
    "grid",
    {
      kind: "event",
      title: "Family vacation",
      allDay: true,
      start: "2027-08-09",
      end: "2027-08-19",
    },
  ],
  [
    27,
    "Concert Dec 31 9pm-1am",
    "quick",
    {
      kind: "event",
      title: "Concert",
      allDay: false,
      start: "2026-12-31T21:00:00-08:00",
      end: "2027-01-01T01:00:00-08:00",
    },
  ],
  [
    28,
    "Investor call 9am ET tomorrow",
    "quick",
    {
      kind: "event",
      title: "Investor call",
      allDay: false,
      start: "2026-10-29T09:00:00-04:00",
      end: "2026-10-29T10:00:00-04:00",
      timeZone: "America/New_York",
    },
  ],
  [
    29,
    "Call 3pm PST",
    "quick",
    {
      kind: "event",
      title: "Call",
      allDay: false,
      start: "2026-10-28T15:00:00-07:00",
      end: "2026-10-28T16:00:00-07:00",
      timeZone: "America/Los_Angeles",
    },
  ],
  [
    30,
    "Sync Monday 4pm GMT",
    "quick",
    {
      kind: "event",
      title: "Sync",
      allDay: false,
      start: "2026-11-02T16:00:00+00:00",
      end: "2026-11-02T17:00:00+00:00",
      timeZone: "GMT",
    },
  ],
  [
    31,
    "Flight 593 Monday 3pm EST to 6pm PST",
    "quick",
    {
      kind: "event",
      title: "Flight 593",
      allDay: false,
      start: "2026-11-02T15:00:00-05:00",
      end: "2026-11-02T18:00:00-08:00",
      timeZone: "America/New_York",
    },
  ],
  [
    32,
    "Yoga every Monday 7am",
    "grid",
    {
      kind: "event",
      title: "Yoga",
      allDay: false,
      start: "2026-11-02T07:00:00-08:00",
      end: "2026-11-02T08:00:00-08:00",
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    },
  ],
  [
    33,
    "Team sync every other Tuesday 10-10:30am /work",
    "quick",
    {
      kind: "event",
      title: "Team sync",
      allDay: false,
      start: "2026-11-03T10:00:00-08:00",
      end: "2026-11-03T10:30:00-08:00",
      rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
      calendarId: "cal-work",
    },
  ],
  [
    34,
    "Standup weekdays at 9:15 until Dec 18",
    "grid",
    {
      kind: "event",
      title: "Standup",
      allDay: false,
      start: "2026-10-29T09:15:00-07:00",
      end: "2026-10-29T10:15:00-07:00",
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261218T171500Z",
    },
  ],
  [
    35,
    "Gym every Mon, Wed, Fri at 7am",
    "grid",
    {
      kind: "event",
      title: "Gym",
      allDay: false,
      start: "2026-10-30T07:00:00-07:00",
      end: "2026-10-30T08:00:00-07:00",
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    },
  ],
  [
    36,
    "Piano Tuesdays and Thursdays 5-6pm",
    "grid",
    {
      kind: "event",
      title: "Piano",
      allDay: false,
      start: "2026-10-29T17:00:00-07:00",
      end: "2026-10-29T18:00:00-07:00",
      rrule: "FREQ=WEEKLY;BYDAY=TU,TH",
    },
  ],
  [
    37,
    "Sam's birthday every year on 5/16",
    "grid",
    {
      kind: "event",
      title: "Sam's birthday",
      allDay: true,
      start: "2027-05-16",
      end: "2027-05-17",
      rrule: "FREQ=YEARLY",
    },
  ],
  [
    38,
    "Pay rent first Friday of each month",
    "quick",
    {
      kind: "task",
      title: "Pay rent",
      when: "date",
      when_date: "2026-11-06",
      rrule: "FREQ=MONTHLY;BYDAY=1FR",
      repeat: "fixed",
    },
  ],
  [
    39,
    "Send invoices on the last day of every month",
    "quick",
    {
      kind: "task",
      title: "Send invoices",
      when: "date",
      when_date: "2026-10-31",
      rrule: "FREQ=MONTHLY;BYMONTHDAY=-1",
      repeat: "fixed",
    },
  ],
  [
    40,
    "Water plants every 3 days",
    "quick",
    {
      kind: "task",
      title: "Water plants",
      when: "date",
      when_date: "2026-10-28",
      rrule: "FREQ=DAILY;INTERVAL=3",
      repeat: "fixed",
    },
  ],
  [
    41,
    "Review budget daily until Dec",
    "quick",
    {
      kind: "task",
      title: "Review budget",
      when: "date",
      when_date: "2026-10-28",
      rrule: "FREQ=DAILY;UNTIL=20261130",
      repeat: "fixed",
    },
  ],
  [
    42,
    "Mow lawn every! 2 weeks",
    "quick",
    {
      kind: "task",
      title: "Mow lawn",
      when: "date",
      when_date: "2026-10-28",
      rrule: "FREQ=WEEKLY;INTERVAL=2",
      repeat: "after_completion",
    },
  ],
  [
    43,
    "Write report tomorrow ~45m p1 !fri /wor",
    "quick",
    {
      kind: "task",
      title: "Write report",
      when: "date",
      when_date: "2026-10-29",
      estimate_min: 45,
      priority: 1,
      deadline: "2026-10-30",
      project_uuid: "p-work",
    },
  ],
  [
    44,
    "File taxes by Nov 15 #admin",
    "quick",
    { kind: "task", title: "File taxes", deadline: "2026-11-15", tags: ["admin"] },
  ],
  [
    45,
    "Ship v2 by end of month p2",
    "quick",
    { kind: "task", title: "Ship v2", deadline: "2026-10-31", priority: 2 },
  ],
  [
    46,
    "Read this evening",
    "quick",
    { kind: "task", title: "Read", when: "evening", when_date: "2026-10-28" },
  ],
  [47, "Learn piano someday", "quick", { kind: "task", title: "Learn piano", when: "someday" }],
  [
    48,
    "Email Anna tomorrow remind me at 9am",
    "quick",
    {
      kind: "task",
      title: "Email Anna",
      when: "date",
      when_date: "2026-10-29",
      reminder_at: "2026-10-29T09:00:00-07:00",
    },
  ],
  [
    49,
    "Deep work tomorrow 9-11:30 #deep",
    "quick",
    {
      kind: "task",
      title: "Deep work",
      when: "date",
      when_date: "2026-10-29",
      start_at: "2026-10-29T09:00:00-07:00",
      estimate_min: 150,
      tags: ["deep"],
    },
  ],
  [
    50,
    "Dentist Nov 3 2:30pm alert 1h before",
    "quick",
    {
      kind: "event",
      title: "Dentist",
      allDay: false,
      start: "2026-11-03T14:30:00-08:00",
      end: "2026-11-03T15:30:00-08:00",
      alertsMin: [60],
    },
  ],
  [
    51,
    "Haircut tomorrow at Quick Cuts 10am alert 30 minutes",
    "quick",
    {
      kind: "event",
      title: "Haircut",
      allDay: false,
      start: "2026-10-29T10:00:00-07:00",
      end: "2026-10-29T11:00:00-07:00",
      location: "Quick Cuts",
      alertsMin: [30],
    },
  ],
  [
    52,
    "Coffee @ Blue Bottle Fri 8:30",
    "quick",
    {
      kind: "event",
      title: "Coffee",
      allDay: false,
      start: "2026-10-30T08:30:00-07:00",
      end: "2026-10-30T09:30:00-07:00",
      location: "Blue Bottle",
    },
  ],
  [
    53,
    "Standup https://meet.google.com/abc-defg-hij tomorrow 9:30am for 15m",
    "quick",
    {
      kind: "event",
      title: "Standup",
      allDay: false,
      start: "2026-10-29T09:30:00-07:00",
      end: "2026-10-29T09:45:00-07:00",
      url: "https://meet.google.com/abc-defg-hij",
    },
  ],
  [
    54,
    "task Book flights Friday",
    "grid",
    { kind: "task", title: "Book flights", when: "date", when_date: "2026-10-30" },
  ],
  [
    55,
    "event Focus time tomorrow",
    "quick",
    { kind: "event", title: "Focus time", allDay: true, start: "2026-10-29", end: "2026-10-30" },
  ],
];

describe("parseQuickEntry: the research table", () => {
  for (const [n, input, surface, expected] of table) {
    test(`#${n} ${input}`, () => {
      const entry = surface === "grid" ? grid(input) : quick(input);
      expect<Record<string, unknown>>(fields(entry)).toEqual(expected);
    });
  }
});

describe("parseQuickEntry: behavior", () => {
  test("weak dates mid-title are suggestions, not applied", () => {
    const entry = quick("Sunday school");
    expect(entry.tokens).toMatchObject([{ kind: "when", applied: false }]);
  });

  test("un-parsed spans stay in the title", () => {
    const entry = parseQuickEntry("Create monthly report", {
      ...base,
      literals: [{ start: 7, end: 14 }],
    });
    expect(fields(entry)).toEqual({ kind: "task", title: "Create monthly report" });
    expect(entry.tokens).toEqual([]);
  });

  test("a token still being typed is pending", () => {
    expect(quick("Lunch tomorrow").tokens.at(-1)?.pending).toBe(true);
    expect(quick("Lunch tomorrow ").tokens.at(-1)?.pending).toBeUndefined();
  });

  test("the switch overrides the signals", () => {
    const entry = parseQuickEntry("Deep work tomorrow 9-11:30 #deep", { ...base, kind: "event" });
    expect(fields(entry)).toEqual({
      kind: "event",
      title: "Deep work",
      allDay: false,
      start: "2026-10-29T09:00:00-07:00",
      end: "2026-10-29T11:30:00-07:00",
    });
    expect(entry.tokens.find((token) => token.kind === "tag")?.applied).toBe(false);
  });

  test("/work is the calendar for events and the project for to-dos", () => {
    expect(parseQuickEntry("Plan /work", { ...base, kind: "event" })).toMatchObject({
      calendarId: "cal-work",
    });
    expect(parseQuickEntry("Plan /work", { ...base, kind: "task" })).toMatchObject({
      project_uuid: "p-work",
    });
  });

  test("an event with no date or time starts at the next quarter hour", () => {
    expect(grid("Focus")).toMatchObject({
      kind: "event",
      start: "2026-10-28T10:45:00-07:00",
      end: "2026-10-28T11:45:00-07:00",
    });
  });
});
