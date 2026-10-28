import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { LocalStore, type SqlDatabase, type SqlRow } from "@cal/sync";
import { monthGridDays } from "../src/renderer/src/components/WhenPicker";
import { newTaskIn, tasksIn } from "../src/renderer/src/lib/lists";

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
