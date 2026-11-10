import { describe, expect, test } from "bun:test";
import type { Task } from "@cal/domain";
import { parseCardTitle, previewTask } from "../src/renderer/src/lib/cardEntry";

// Wed 2026-10-28 10:40, the fixture's clock.
const NOW = new Date(2026, 9, 28, 10, 40);
const CONTEXT = {
  projects: [{ uuid: "launch", title: "Launch v2" }],
  weekStartsOn: 1,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};
const TODAY_TASK: Task = {
  uuid: "t",
  title: "",
  position: -1,
  when: "date",
  when_date: "2026-10-28",
  area_uuid: "home",
  deadline: "2026-11-02",
  created_at: 0,
  updated_at: 0,
};

describe("parseCardTitle", () => {
  test("reads a new card's title as a to-do", () => {
    const entry = parseCardTitle("Call the movers tomorrow 3pm ~30m /launch", [], CONTEXT, NOW);
    expect(entry).toMatchObject({
      kind: "task",
      title: "Call the movers",
      when: "date",
      when_date: "2026-10-29",
      estimate_min: 30,
      project_uuid: "launch",
    });
    expect(new Date(entry.start_at ?? "").getHours()).toBe(15);
  });

  test("an un-parsed span stays in the title", () => {
    const text = "Read tomorrow";
    const start = text.indexOf("tomorrow");
    const entry = parseCardTitle(text, [{ start, end: text.length }], CONTEXT, NOW);
    expect(entry.title).toBe("Read tomorrow");
    expect(entry.when).toBeUndefined();
  });

  test("text that is only tokens leaves no title", () => {
    expect(parseCardTitle("tomorrow", [], CONTEXT, NOW).title).toBe("");
  });
});

describe("previewTask", () => {
  test("shows the typed fields over the to-do's own", () => {
    const entry = parseCardTitle("Pay rent tonight #home", [], CONTEXT, NOW);
    expect(previewTask(TODAY_TASK, entry)).toMatchObject({
      when: "evening",
      when_date: "2026-10-28",
      tags: "home",
      // Not named in the text: kept.
      deadline: "2026-11-02",
      area_uuid: "home",
    });
  });

  test("an undated When drops the list's day, and a project the area", () => {
    const entry = parseCardTitle("Learn Italian someday /launch", [], CONTEXT, NOW);
    const preview = previewTask(TODAY_TASK, entry);
    expect(preview).toMatchObject({ when: "someday", project_uuid: "launch" });
    expect(preview.when_date).toBeUndefined();
    expect(preview.area_uuid).toBeUndefined();
  });
});
