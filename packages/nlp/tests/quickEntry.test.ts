import { describe, expect, test } from "bun:test";
import { parseQuickEntry } from "../src";

// Wednesday 2026-10-28, 10:40 local time.
const now = new Date(2026, 9, 28, 10, 40);
const projects = [{ uuid: "p-work", title: "Work" }];

describe("parseQuickEntry", () => {
  test("plain text is just a title", () => {
    expect(parseQuickEntry("Buy milk", now)).toEqual({ title: "Buy milk", tokens: [] });
  });

  test("reads When, estimate, priority, deadline and project", () => {
    const entry = parseQuickEntry("Write report tomorrow ~45m p1 !fri /wor", now, projects);
    expect(entry).toMatchObject({
      title: "Write report",
      when: "date",
      when_date: "2026-10-29",
      estimate_min: 45,
      priority: 1,
      deadline: "2026-10-30",
      project_uuid: "p-work",
    });
    expect(entry.start_at).toBeUndefined();
    expect(entry.tokens.map((token) => token.kind)).toEqual([
      "when",
      "estimate",
      "priority",
      "deadline",
      "project",
    ]);
  });

  test("a time sets start_at", () => {
    const entry = parseQuickEntry("Call mom next tue 3pm", now);
    expect(entry.title).toBe("Call mom");
    expect(entry.when_date).toBe("2026-11-03");
    expect(entry.start_at?.getHours()).toBe(15);
  });

  test("estimates in hours and minutes", () => {
    expect(parseQuickEntry("Deep work ~2h", now).estimate_min).toBe(120);
    expect(parseQuickEntry("Deep work ~1h30", now).estimate_min).toBe(90);
    expect(parseQuickEntry("Deep work ~25", now).estimate_min).toBe(25);
  });

  test("tonight and someday", () => {
    expect(parseQuickEntry("Read tonight", now)).toMatchObject({
      title: "Read",
      when: "evening",
      when_date: "2026-10-28",
    });
    expect(parseQuickEntry("Learn piano someday", now)).toMatchObject({
      title: "Learn piano",
      when: "someday",
    });
  });

  test("an unknown project stays in the title", () => {
    expect(parseQuickEntry("Ship /nowhere", now, projects).title).toBe("Ship /nowhere");
  });
});
