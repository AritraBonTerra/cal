import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { LocalStore, type SqlDatabase, type SqlRow } from "@cal/sync";
import {
  CommandRegistry,
  createActions,
  History,
  type KeyInput,
  keyLabels,
  matches,
  searchCommands,
  storeSource,
} from "../src";

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

function setup() {
  const store = memoryStore();
  const history = new History(storeSource(store));
  const actions = createActions(history, () => new Date(2026, 9, 28, 10, 40));
  return { store, history, actions };
}

const key = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("History", () => {
  test("undo and redo an edit", async () => {
    const { store, history, actions } = setup();
    const uuid = await actions.createTask({ title: "Plan", position: 0, when: "inbox" });
    await actions.updateTask(uuid, { title: "Plan the week", notes: "Monday" });
    expect(history.nextUndo).toBe("Edit To-Do");

    await history.undo();
    expect(store.get("tasks", uuid)).toMatchObject({ title: "Plan" });
    expect(store.get("tasks", uuid)).not.toHaveProperty("notes");

    await history.redo();
    expect(store.get("tasks", uuid)).toMatchObject({ title: "Plan the week", notes: "Monday" });
  });

  test("undoing a delete restores the task and its blocks, linked under new ids", async () => {
    const { store, history, actions } = setup();
    const uuid = await actions.createTask({ title: "Plan", position: 0, when: "inbox" });
    await actions.scheduleTask(uuid, new Date(2026, 9, 28, 9), new Date(2026, 9, 28, 10));
    await actions.deleteTask(uuid);
    expect(store.list("tasks")).toEqual([]);
    expect(store.list("time_blocks")).toEqual([]);

    await history.undo();
    const [task] = store.list("tasks");
    const [block] = store.list("time_blocks");
    expect(task?.title).toBe("Plan");
    expect(block?.task_uuid).toBe(task?.uuid);

    // Earlier steps still find the restored task through its new id.
    await actions.updateTask(uuid, { title: "Renamed via old id" });
    expect(store.get("tasks", task?.uuid ?? "")?.title).toBe("Renamed via old id");
  });

  test("ids from before an undo still reach the restored record", async () => {
    const { store, history, actions } = setup();
    const uuid = await actions.createTask({ title: "Plan", position: 0, when: "inbox" });
    await history.undo();
    await history.redo();
    const [task] = store.list("tasks");
    expect(task?.uuid).not.toBe(uuid);

    await actions.scheduleTask(uuid, new Date(2026, 9, 28, 9), new Date(2026, 9, 28, 10));
    expect(store.list("time_blocks")[0]?.task_uuid).toBe(task?.uuid);
    await actions.deleteTask(uuid);
    expect(store.list("tasks")).toEqual([]);
    expect(store.list("time_blocks")).toEqual([]);
  });

  test("changes outside Cal's tables undo and redo in the same step", async () => {
    const { history } = setup();
    let start = "10:00";
    const move = (to: string) => async () => {
      start = to;
    };
    await history.transact("Move Event", (tx) => tx.external(move("11:00"), move("10:00")));
    expect(start).toBe("11:00");
    await history.undo();
    expect(start).toBe("10:00");
    await history.redo();
    expect(start).toBe("11:00");
  });

  test("undoing a create removes it; redo brings it back", async () => {
    const { store, history, actions } = setup();
    await actions.createTask({ title: "Plan", position: 0, when: "inbox" });
    await history.undo();
    expect(store.list("tasks")).toEqual([]);
    await history.redo();
    expect(store.list("tasks").map((task) => task.title)).toEqual(["Plan"]);
  });

  test("logging a habit replaces the day's entry and 0 unchecks it", async () => {
    const { store, actions } = setup();
    await actions.logHabit("h", "2026-10-28", 1);
    await actions.logHabit("h", "2026-10-28", 3);
    expect(store.list("habit_entries").map((entry) => entry.value)).toEqual([3]);
    await actions.logHabit("h", "2026-10-28", 0);
    expect(store.list("habit_entries")).toEqual([]);
  });
});

describe("commands", () => {
  test("bindings match the right modifiers", () => {
    expect(matches("mod+k", key("k", { metaKey: true }), true)).toBe(true);
    expect(matches("mod+k", key("k", { ctrlKey: true }), false)).toBe(true);
    expect(matches("mod+k", key("k"), true)).toBe(false);
    expect(matches("t", key("T", { shiftKey: true }), true)).toBe(false);
    expect(matches("?", key("?", { shiftKey: true }), true)).toBe(true);
    expect(matches("shift+right", key("ArrowRight", { shiftKey: true }), true)).toBe(true);
  });

  test("keycap labels", () => {
    expect(keyLabels("mod+shift+k", true)).toEqual(["⇧", "⌘", "K"]);
    expect(keyLabels("left", true)).toEqual(["←"]);
  });

  test("later registrations win and unregistering restores the earlier one", () => {
    const registry = new CommandRegistry();
    const ran: string[] = [];
    registry.register([
      { id: "today", title: "Today", keys: ["t"], run: () => ran.push("global") },
    ]);
    const off = registry.register([
      { id: "today", title: "Today", keys: ["t"], run: () => ran.push("view") },
    ]);
    registry.handle(key("t"), true);
    off();
    registry.handle(key("t"), true);
    expect(ran).toEqual(["view", "global"]);
  });

  test("disabled commands are inert and hidden unless asked for", () => {
    const registry = new CommandRegistry();
    let enabled = false;
    const ran: string[] = [];
    registry.register([
      {
        id: "delete",
        title: "Delete",
        keys: ["backspace"],
        enabled: () => enabled,
        run: () => ran.push("delete"),
      },
    ]);
    expect(registry.handle(key("Backspace"), true)).toBe(false);
    expect(registry.list()).toHaveLength(0);
    expect(registry.list(true).map((command) => command.id)).toEqual(["delete"]);
    enabled = true;
    expect(registry.handle(key("Backspace"), true)).toBe(true);
    expect(ran).toEqual(["delete"]);
  });

  test("palette search matches word starts and ranks title prefixes first", () => {
    const run = () => {};
    const commands = [
      { id: "a", title: "Show 7 Days", group: "View", run },
      { id: "b", title: "Go to Today", group: "Navigate", run },
      { id: "c", title: "Today View", aliases: ["home"], run },
    ];
    expect(searchCommands(commands, "tod").map((command) => command.id)).toEqual(["c", "b"]);
    expect(searchCommands(commands, "home").map((command) => command.id)).toEqual(["c"]);
    expect(searchCommands(commands, "view").map((command) => command.id)).toEqual(["a", "c"]);
  });
});
