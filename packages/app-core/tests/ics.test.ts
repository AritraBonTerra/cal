import { describe, expect, test } from "bun:test";
import { fromDayKey, toOffsetIso } from "@cal/domain";
import { parseIcs } from "../src";

const file = (...lines: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join("\r\n");
const event = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
const only = (...lines: string[]) => parseIcs(file(...event(...lines))).events[0];
const ms = (iso: string | undefined) => Date.parse(iso ?? "");

describe("parseIcs", () => {
  test("reads times in UTC, in a named zone, and in Outlook's names", () => {
    expect(ms(only("SUMMARY:A", "DTSTART:20261028T170000Z", "DTEND:20261028T180000Z")?.start)).toBe(
      Date.UTC(2026, 9, 28, 17),
    );
    const paris = only("DTSTART;TZID=Europe/Paris:20261028T090000", "DURATION:PT1H30M");
    expect(ms(paris?.start)).toBe(Date.UTC(2026, 9, 28, 8));
    expect(ms(paris?.end)).toBe(Date.UTC(2026, 9, 28, 9, 30));
    expect(paris?.timeZone).toBe("Europe/Paris");
    const outlook = only('DTSTART;TZID="Pacific Standard Time":20261028T090000');
    expect(ms(outlook?.start)).toBe(Date.UTC(2026, 9, 28, 16));
    expect(outlook?.timeZone).toBe("America/Los_Angeles");
    expect(only("DTSTART;TZID=/freeassociation.org/Asia/Tokyo:20261028T090000")?.timeZone).toBe(
      "Asia/Tokyo",
    );
  });

  test("a time with no zone, or one nobody knows, is this device's", () => {
    const local = new Date(2026, 9, 28, 9).getTime();
    expect(ms(only("DTSTART:20261028T090000")?.start)).toBe(local);
    expect(ms(only("DTSTART;TZID=Custom Zone:20261028T090000")?.start)).toBe(local);
  });

  test("reads all-day events, the end exclusive, one day when it's missing", () => {
    const trip = only("DTSTART;VALUE=DATE:20261030", "DTEND;VALUE=DATE:20261102");
    expect(trip).toMatchObject({
      allDay: true,
      busy: false,
      start: toOffsetIso(fromDayKey("2026-10-30")),
      end: toOffsetIso(fromDayKey("2026-11-02")),
    });
    expect(only("DTSTART;VALUE=DATE:20261030")?.end).toBe(toOffsetIso(fromDayKey("2026-10-31")));
  });

  test("unfolds and unescapes text", () => {
    const read = only(
      "SUMMARY:Lunch\\, then\r\n  a walk",
      "LOCATION:Room 4; left",
      "DESCRIPTION:One\\nTwo \\\\ three",
      "DTSTART:20261028T170000Z",
    );
    expect(read).toMatchObject({
      title: "Lunch, then a walk",
      location: "Room 4; left",
      notes: "One\nTwo \\ three",
    });
  });

  test("keeps the repeat, reminders, free time and the call", () => {
    const read = only(
      "SUMMARY:Standup",
      "DTSTART:20261028T170000Z",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
      "TRANSP:TRANSPARENT",
      "X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij",
      "BEGIN:VALARM",
      "SUMMARY:Not the title",
      "TRIGGER:-PT15M",
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER;RELATED=END:-PT5M",
      "END:VALARM",
    );
    expect(read).toMatchObject({
      title: "Standup",
      recurrence: "FREQ=WEEKLY;BYDAY=MO,WE",
      busy: false,
      url: "https://meet.google.com/abc-defg-hij",
      alarms: [15],
    });
  });

  test("counts what it can't bring over instead of guessing", () => {
    const read = parseIcs(
      file(
        ...event(
          "SUMMARY:Series",
          "DTSTART:20261028T170000Z",
          "RRULE:FREQ=DAILY",
          "EXDATE:20261029T170000Z",
        ),
        ...event("SUMMARY:Moved", "DTSTART:20261030T180000Z", "RECURRENCE-ID:20261030T170000Z"),
        ...event("SUMMARY:Off", "DTSTART:20261028T170000Z", "STATUS:CANCELLED"),
        ...event("SUMMARY:No date"),
      ),
    );
    expect(read.events.map((each) => each.title)).toEqual(["Series"]);
    expect(read).toMatchObject({ exceptions: 2, skipped: 2 });
  });

  test("a series in UTC keeps its zone, and a single event needs none", () => {
    expect(only("DTSTART:20261028T170000Z", "RRULE:FREQ=WEEKLY")?.timeZone).toBe("UTC");
    expect(only("DTSTART:20261028T170000Z")?.timeZone).toBeUndefined();
  });

  test("a day's length keeps the clock time across a DST change; hours don't", () => {
    // New York falls back on 1 November 2026.
    const start = "DTSTART;TZID=America/New_York:20261031T120000";
    expect(ms(only(start, "DURATION:P1D")?.end)).toBe(Date.UTC(2026, 10, 1, 17));
    expect(ms(only(start, "DURATION:PT24H")?.end)).toBe(Date.UTC(2026, 10, 1, 16));
    expect(ms(only("DTSTART:20261028T170030Z")?.start)).toBe(Date.UTC(2026, 9, 28, 17, 0, 30));
  });

  test("reads an UNTIL in local time in the event's zone", () => {
    expect(
      only(
        "DTSTART;TZID=America/New_York:20261028T090000",
        "RRULE:FREQ=DAILY;UNTIL=20261030T090000",
      )?.recurrence,
    ).toBe("FREQ=DAILY;UNTIL=20261030T130000Z");
  });

  test("a rule a calendar can't keep brings the event once and is counted", () => {
    for (const rule of ["FREQ=HOURLY", "FREQ=YEARLY;BYWEEKNO=20", "FREQ=YEARLY;BYYEARDAY=1"]) {
      const read = parseIcs(file(...event("DTSTART:20261028T170000Z", `RRULE:${rule}`)));
      expect(read.events[0]?.recurrence).toBeUndefined();
      expect(read.exceptions).toBe(1);
    }
  });

  test("a cancellation brings nothing, and other text isn't a calendar", () => {
    expect(parseIcs(file("METHOD:CANCEL", ...event("DTSTART:20261028T170000Z")))).toMatchObject({
      events: [],
      skipped: 1,
    });
    expect(parseIcs("just some text: with a colon").events).toEqual([]);
    expect(parseIcs(file(...event("DTSTART:20261399T170000Z"))).events).toEqual([]);
  });

  test("an end before its start never makes a negative event", () => {
    const read = only("DTSTART:20261028T170000Z", "DTEND:20261028T160000Z");
    expect(read?.end).toBe(read?.start ?? "");
  });
});
