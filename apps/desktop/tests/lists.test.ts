import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { LocalStore, type SqlDatabase, type SqlRow } from "@cal/sync";
import { monthGridDays } from "../src/renderer/src/components/WhenPicker";
import { listTitle, moveInto, newTaskIn, tasksIn } from "../src/renderer/src/lib/lists";

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

describe("newTaskIn", () => {
  test("a to-do made in Upcoming shows up in Upcoming", () => {
    const store = memoryStore();
    store.insert("tasks", { title: "", ...newTaskIn("upcoming", today) });
    const rows = tasksIn("upcoming", store.list("tasks"), today);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.when_date).toBe("2026-10-29");
  });

  test("a to-do made in Today shows up in Today", () => {
    const store = memoryStore();
    store.insert("tasks", { title: "", ...newTaskIn("today", today) });
    expect(tasksIn("today", store.list("tasks"), today)).toHaveLength(1);
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
