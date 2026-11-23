import { expect, test } from "bun:test";
import type { ExternalEvent } from "@cal/calendar-source";
import { pendingInvitations } from "../src";

const now = new Date("2026-10-28T10:40:00-07:00");
const event = (id: string, day: string, extra: Partial<ExternalEvent> = {}): ExternalEvent => ({
  id,
  calendarId: "work",
  title: id,
  start: `2026-${day}T13:00:00-07:00`,
  end: `2026-${day}T14:00:00-07:00`,
  allDay: false,
  recurring: false,
  busy: true,
  myStatus: "pending",
  ...extra,
});

test("lists unanswered invitations ahead, soonest first", () => {
  const events = [
    event("later", "11-03"),
    event("soon", "10-28"),
    event("over", "10-27"),
    event("accepted", "10-29", { myStatus: "accepted" }),
    event("mine", "10-29", { myStatus: undefined }),
  ];
  expect(pendingInvitations(events, now).map((each) => each.id)).toEqual(["soon", "later"]);
});

test("a repeating invitation counts once, at its next occurrence", () => {
  const events = [event("sync|2026-11-04", "11-04"), event("sync|2026-10-28", "10-28")];
  expect(pendingInvitations(events, now).map((each) => each.id)).toEqual(["sync|2026-10-28"]);
});
