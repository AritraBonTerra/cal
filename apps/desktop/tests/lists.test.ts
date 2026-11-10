import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { toOffsetIso } from "@cal/domain";
import { LocalStore, type SqlDatabase, type SqlRow } from "@cal/sync";
import { monthGridDays } from "../src/renderer/src/components/WhenPicker";
import {
  listSections,
  listTitle,
  moveInto,
  newTaskIn,
  nextBlock,
  sectionKey,
  tasksIn,
} from "../src/renderer/src/lib/lists";

function memoryStore() {
  const db = new Database(":memory:");
  const adapter: SqlDatabase = {
    run: (sql, params = []) => {
      db.query(sql).run(...params);
    },
    all: (sql, params = []) => db.query<SqlRow, SqlRow[keyof SqlRow][]>(sql).all(...params),
    transaction: (fn) => db.transaction(fn)(),
  };
  return new LocalStore(adapter);
}

const today = "2026-10-28";
const zone = "America/Los_Angeles";
// The fixture clock: Wed 2026-10-28 10:40 in the Mac's zone (tests run in LA time).
const at = { today, gridToday: today, zone, now: new Date(2026, 9, 28, 10, 40) };

// The store's tables as the pane reads them.
const tables = (store: LocalStore) => ({
  tasks: store.list("tasks"),
  blocks: store.list("time_blocks"),
  projects: store.list("projects"),
  areas: store.list("areas"),
});

// A block for `task` from `start` to `end`, as "HH:MM" on `day` in the Mac's zone.
function block(store: LocalStore, task: string, day: string, start: string, end: string) {
  const iso = (time: string) => toOffsetIso(new Date(`${day}T${time}:00`));
  return store.insert("time_blocks", {
    task_uuid: task,
    start_at: iso(start),
    end_at: iso(end),
    time_zone: zone,
    source: "manual",
  });
}

describe("newTaskIn", () => {
  test("a to-do made in Upcoming shows up in Upcoming", () => {
    const store = memoryStore();
    store.insert("tasks", { title: "", ...newTaskIn("upcoming", today) });
    const rows = tasksIn("upcoming", tables(store), at);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.when_date).toBe("2026-10-29");
  });

  test("a to-do made in Today shows up in Today", () => {
    const store = memoryStore();
    store.insert("tasks", { title: "", ...newTaskIn("today", today) });
    expect(tasksIn("today", tables(store), at)).toHaveLength(1);
  });
});

describe("monthGridDays", () => {
  test("November 2026 starts on a Sunday and needs six Monday-first rows", () => {
    const days = monthGridDays("2026-11-01");
    expect(days[0]).toBe("2026-10-26");
    expect(days).toContain("2026-11-30");
    expect(days).toHaveLength(42);
  });

  test("a month that fits in five rows gets five", () => {
    // February 2027 starts on a Monday and has 28 days.
    expect(monthGridDays("2027-02-01")).toHaveLength(35);
  });
});

describe("moveInto", () => {
  const task = { uuid: "t", title: "Spec", position: 0, created_at: 0, updated_at: 0 };
  test("a to-do holds a project or an area, never both", () => {
    expect(moveInto({ ...task, when: "anytime", area_uuid: "home" }, { project: "p" })).toEqual({
      project_uuid: "p",
      area_uuid: null,
    });
    expect(moveInto({ ...task, when: "someday", project_uuid: "p" }, { area: "home" })).toEqual({
      area_uuid: "home",
      project_uuid: null,
    });
  });

  test("leaving the Inbox for a project puts it in Anytime", () => {
    expect(moveInto({ ...task, when: "inbox" }, { project: "p" })).toMatchObject({
      when: "anytime",
    });
  });
});

describe("listTitle", () => {
  test("a new project or area reads as such until it has a title", () => {
    const projects = [{ uuid: "p", title: "", position: 0, created_at: 0, updated_at: 0 }];
    const areas = [{ uuid: "a", title: "", position: 0, created_at: 0, updated_at: 0 }];
    expect(listTitle("project:p", projects, areas)).toBe("New Project");
    expect(listTitle("area:a", projects, areas)).toBe("New Area");
    expect(listTitle("project:gone", projects, areas)).toBe("");
  });
});

describe("listSections", () => {
  test("Today puts This Evening in its own section, last", () => {
    const store = memoryStore();
    store.insert("tasks", { title: "Evening", position: 0, when: "evening", when_date: today });
    store.insert("tasks", { title: "Day", position: 1, when: "date", when_date: today });
    const sections = listSections("today", tables(store), at);
    expect(sections.map((section) => section.kind)).toEqual(["plain", "evening"]);
    expect(tasksIn("today", tables(store), at).map((task) => task.title)).toEqual([
      "Day",
      "Evening",
    ]);
  });

  test("an empty section is left out", () => {
    const store = memoryStore();
    store.insert("tasks", { title: "Day", position: 0, when: "date", when_date: today });
    expect(listSections("today", tables(store), at)).toHaveLength(1);
  });
});

describe("Today's Scheduled split", () => {
  test("rows with a block still ahead today come first, by start, then Not scheduled", () => {
    const store = memoryStore();
    const late = store.insert("tasks", {
      title: "Late",
      position: 0,
      when: "date",
      when_date: today,
    });
    const early = store.insert("tasks", {
      title: "Early",
      position: 1,
      when: "date",
      when_date: today,
    });
    store.insert("tasks", { title: "Loose", position: 2, when: "date", when_date: today });
    const evening = store.insert("tasks", {
      title: "Evening",
      position: 3,
      when: "evening",
      when_date: today,
    });
    block(store, late, today, "15:00", "16:00");
    block(store, early, today, "11:00", "12:00");
    block(store, evening, today, "19:00", "19:30");
    const sections = listSections("today", tables(store), at);
    expect(sections.map((section) => section.kind)).toEqual(["scheduled", "unscheduled"]);
    expect(sections.map((section) => section.rows.map((task) => task.title))).toEqual([
      ["Early", "Late", "Evening"],
      ["Loose"],
    ]);
    // ↑/↓ read the same order.
    expect(tasksIn("today", tables(store), at).map((task) => task.title)).toEqual([
      "Early",
      "Late",
      "Evening",
      "Loose",
    ]);
  });

  test("ended, done and later-day blocks don't count as scheduled today", () => {
    const store = memoryStore();
    const ended = store.insert("tasks", {
      title: "Ended",
      position: 0,
      when: "date",
      when_date: today,
    });
    const done = store.insert("tasks", {
      title: "Done",
      position: 1,
      when: "date",
      when_date: today,
    });
    const later = store.insert("tasks", {
      title: "Later",
      position: 2,
      when: "date",
      when_date: today,
    });
    block(store, ended, today, "09:00", "10:00");
    const doneBlock = block(store, done, today, "13:00", "14:00");
    store.update("time_blocks", doneBlock, { done_at: 1 });
    block(store, later, "2026-10-29", "09:00", "10:00");
    const sections = listSections("today", tables(store), at);
    // Nothing scheduled: the list looks as it did, with no headings.
    expect(sections.map((section) => section.kind)).toEqual(["plain"]);
  });

  test("a block running now counts, and its start is the time shown", () => {
    const store = memoryStore();
    const running = store.insert("tasks", {
      title: "Now",
      position: 0,
      when: "date",
      when_date: today,
    });
    const id = block(store, running, today, "10:30", "11:30");
    const [section] = listSections("today", tables(store), at);
    expect(section?.kind).toBe("scheduled");
    if (section?.kind === "scheduled") expect(section.next.get(running)?.uuid).toBe(id);
  });
});

describe("nextBlock", () => {
  test("is the earliest block that isn't done and hasn't ended", () => {
    const store = memoryStore();
    const task = store.insert("tasks", { title: "T", position: 0, when: "anytime" });
    block(store, task, today, "08:00", "09:00");
    const thursday = block(store, task, "2026-10-29", "14:00", "15:00");
    block(store, task, "2026-10-30", "09:00", "10:00");
    const row = store.list("tasks")[0];
    if (!row) throw new Error("no task");
    expect(nextBlock(row, store.list("time_blocks"), at.now)?.uuid).toBe(thursday);
  });
});

describe("Upcoming groups", () => {
  test("a section per day through the next week, then per month, in order", () => {
    const store = memoryStore();
    const on = (title: string, day: string, position = 0) =>
      store.insert("tasks", { title, position, when: "date", when_date: day });
    on("Next month", "2026-12-03");
    on("Tomorrow B", "2026-10-29", 1);
    on("Tomorrow A", "2026-10-29", 0);
    on("Week end", "2026-11-04");
    on("Past the week", "2026-11-05");
    on("Next year", "2027-01-15");
    const sections = listSections("upcoming", tables(store), at);
    expect(sections.map(sectionKey)).toEqual([
      "day:2026-10-29",
      "day:2026-11-04",
      "month:2026-11-01",
      "month:2026-12-01",
      "month:2027-01-01",
    ]);
    expect(tasksIn("upcoming", tables(store), at).map((task) => task.title)).toEqual([
      "Tomorrow A",
      "Tomorrow B",
      "Week end",
      "Past the week",
      "Next month",
      "Next year",
    ]);
  });
});

describe("Anytime groups", () => {
  test("loose to-dos first, then projects by area position and project position", () => {
    const store = memoryStore();
    const work = store.insert("areas", { title: "Work", position: 1 });
    const home = store.insert("areas", { title: "Home", position: 0 });
    const launch = store.insert("projects", { title: "Launch", area_uuid: work, position: 0 });
    const move = store.insert("projects", { title: "Move", area_uuid: home, position: 5 });
    const solo = store.insert("projects", { title: "Solo", position: 9 });
    const anytime = (title: string, fields = {}) =>
      store.insert("tasks", { title, position: 0, when: "anytime", ...fields });
    anytime("In launch", { project_uuid: launch });
    anytime("In move", { project_uuid: move });
    anytime("In solo", { project_uuid: solo });
    anytime("Area only", { area_uuid: work });
    anytime("Loose");
    const sections = listSections("anytime", tables(store), at);
    expect(sections.map(sectionKey)).toEqual([
      "plain",
      `project:${solo}`,
      `project:${move}`,
      `project:${launch}`,
    ]);
    expect(sections[0]?.rows.map((task) => task.title).sort()).toEqual(["Area only", "Loose"]);
    expect(
      tasksIn("anytime", tables(store), at)
        .slice(2)
        .map((task) => task.title),
    ).toEqual(["In solo", "In move", "In launch"]);
  });
});
