import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { LocalStore, type SqlDatabase, type SqlRow } from "@cal/sync";
import {
  bindingFor,
  CommandRegistry,
  commandsUsing,
  createActions,
  History,
  type KeyInput,
  keyLabels,
  matches,
  normalizeBinding,
  sameKeys,
  searchCommands,
  searchShortcuts,
  storeSource,
  withKeys,
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

  test("settled waits for the writes queued so far", async () => {
    const { store, history, actions } = setup();
    const uuid = await actions.createTask({ title: "Plan", position: 0, when: "inbox" });
    // Not awaited, as when a field saves on blur just before the window closes.
    void actions.updateTask(uuid, { notes: "Monday" });
    expect(store.get("tasks", uuid)).not.toHaveProperty("notes");
    await history.settled();
    expect(store.get("tasks", uuid)).toMatchObject({ notes: "Monday" });
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

  test("clear forgets every step", async () => {
    const { store, history, actions } = setup();
    await actions.createTask({ title: "Plan", position: 0, when: "inbox" });
    await history.clear();
    expect(history.nextUndo).toBeUndefined();
    await history.undo();
    expect(store.list("tasks")).toHaveLength(1);
  });

  test("undoing a create removes it; redo brings it back", async () => {
    const { store, history, actions } = setup();
    await actions.createTask({ title: "Plan", position: 0, when: "inbox" });
    await history.undo();
    expect(store.list("tasks")).toEqual([]);
    await history.redo();
    expect(store.list("tasks").map((task) => task.title)).toEqual(["Plan"]);
  });

  test("scheduling twice at once picks two slots, around blocks from yesterday", async () => {
    const { store, actions } = setup();
    const task = await actions.createTask({
      title: "Plan",
      position: 0,
      when: "inbox",
      estimate_min: 60,
    });
    // A block from 23:00 yesterday to 11:00 today; the clock reads 10:40.
    const overnight = [new Date(2026, 9, 27, 23), new Date(2026, 9, 28, 11)] as const;
    await actions.scheduleTask(task, ...overnight);
    await Promise.all([actions.scheduleNext(task, []), actions.scheduleNext(task, [])]);
    const placed = store
      .list("time_blocks")
      .map((block) => [new Date(block.start_at).getTime(), new Date(block.end_at).getTime()])
      .filter(([start]) => start !== overnight[0].getTime())
      .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
    // The overnight block already covers the estimate, so each gets the 30 min default,
    // one after the other rather than both at 11:00.
    expect(placed).toEqual([
      [new Date(2026, 9, 28, 11).getTime(), new Date(2026, 9, 28, 11, 30).getTime()],
      [new Date(2026, 9, 28, 11, 30).getTime(), new Date(2026, 9, 28, 12).getTime()],
    ]);
  });

  test("a parsed to-do keeps its tags and reminder", async () => {
    const { store, actions } = setup();
    const uuid = await actions.createFromEntry({
      kind: "task",
      title: "File taxes",
      tokens: [],
      tags: ["admin", "money"],
      reminder_at: "2026-10-29T09:00:00-07:00",
    });
    expect(store.get("tasks", uuid)).toMatchObject({
      tags: "admin,money",
      reminder_at: "2026-10-29T09:00:00-07:00",
    });
  });

  test("a parse applied to an open to-do writes what it names, in one step", async () => {
    const { store, history, actions } = setup();
    const uuid = await actions.createTask({
      title: "",
      position: -1,
      when: "date",
      when_date: "2026-10-28",
      area_uuid: "home",
      tags: "errand",
    });
    await actions.applyEntry(
      uuid,
      {
        kind: "task",
        title: "Call the movers",
        tokens: [],
        when: "date",
        when_date: "2026-10-29",
        start_at: "2026-10-29T15:00:00-07:00",
        deadline: "2026-10-30",
        estimate_min: 45,
        priority: 2,
        project_uuid: "launch",
        tags: ["phone"],
        reminder_at: "2026-10-29T14:45:00-07:00",
        rrule: "FREQ=WEEKLY;BYDAY=TH",
        repeat: "after_completion",
      },
      { notes: "Ask about Saturday" },
    );
    expect(store.get("tasks", uuid)).toMatchObject({
      title: "Call the movers",
      notes: "Ask about Saturday",
      when: "date",
      when_date: "2026-10-29",
      deadline: "2026-10-30",
      estimate_min: 45,
      priority: 2,
      project_uuid: "launch",
      // The text's tags replace the ones set by hand.
      tags: "phone",
      reminder_at: "2026-10-29T14:45:00-07:00",
      recurrence_rule: "FREQ=WEEKLY;BYDAY=TH",
      recurrence_mode: "after_completion",
    });
    // A typed project takes the to-do out of the area it was made in.
    expect(store.get("tasks", uuid)).not.toHaveProperty("area_uuid");
    const [block] = store.list("time_blocks");
    expect(block?.task_uuid).toBe(uuid);
    expect(
      new Date(block?.end_at ?? "").getTime() - new Date(block?.start_at ?? "").getTime(),
    ).toBe(45 * 60_000);
    expect(history.nextUndo).toBe("Edit To-Do");
    await history.undo();
    expect(store.get("tasks", uuid)).toMatchObject({ title: "", when_date: "2026-10-28" });
    expect(store.list("time_blocks")).toEqual([]);
  });

  test("a parse leaves fields it doesn't name as the list and chips set them", async () => {
    const { store, actions } = setup();
    const uuid = await actions.createTask({
      title: "",
      position: -1,
      when: "date",
      when_date: "2026-10-28",
      estimate_min: 20,
      deadline: "2026-11-02",
    });
    await actions.applyEntry(uuid, {
      kind: "task",
      title: "Water plants",
      tokens: [],
      start_at: "2026-10-28T16:00:00-07:00",
    });
    expect(store.get("tasks", uuid)).toMatchObject({
      title: "Water plants",
      when: "date",
      when_date: "2026-10-28",
      estimate_min: 20,
      deadline: "2026-11-02",
    });
    // The block lasts the estimate set by hand.
    const [block] = store.list("time_blocks");
    expect(
      new Date(block?.end_at ?? "").getTime() - new Date(block?.start_at ?? "").getTime(),
    ).toBe(20 * 60_000);
  });

  test("an undated When in the text clears the list's day", async () => {
    const { store, actions } = setup();
    const uuid = await actions.createTask({
      title: "",
      position: -1,
      when: "date",
      when_date: "2026-10-28",
    });
    await actions.applyEntry(uuid, {
      kind: "task",
      title: "Learn Italian",
      tokens: [],
      when: "someday",
    });
    expect(store.get("tasks", uuid)).toMatchObject({ title: "Learn Italian", when: "someday" });
    expect(store.get("tasks", uuid)).not.toHaveProperty("when_date");
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

describe("lists and habits", () => {
  test("new projects, areas and habits land at the end of their lists", async () => {
    const { store, history, actions } = setup();
    const work = await actions.createArea({ title: "Work" });
    const home = await actions.createArea({ title: "Home" });
    const launch = await actions.createProject({ title: "Launch", area_uuid: work });
    const loose = await actions.createProject({ title: "" });
    expect(store.get("areas", home)?.position).toBe(1);
    expect(store.get("projects", launch)).toMatchObject({ area_uuid: work, position: 0 });
    expect(store.get("projects", loose)).toMatchObject({ title: "", position: 1 });
    expect(store.get("projects", loose)).not.toHaveProperty("area_uuid");

    await actions.updateProject(loose, { title: "Garden" }, "Rename Project");
    expect(history.nextUndo).toBe("Rename Project");
    await history.undo();
    expect(store.get("projects", loose)?.title).toBe("");

    const habit = await actions.createHabit({
      title: "Stretch",
      kind: "check",
      schedule: "interval",
      interval_days: 2,
      display: "strip",
    });
    expect(store.get("habits", habit)?.position).toBe(0);
  });

  test("deleting a project keeps its to-dos, in its area; undo puts them back", async () => {
    const { store, history, actions } = setup();
    const work = await actions.createArea({ title: "Work" });
    const project = await actions.createProject({ title: "Launch", area_uuid: work });
    const task = await actions.createTask({
      title: "Spec",
      position: 0,
      when: "anytime",
      project_uuid: project,
    });
    await actions.deleteProject(project);
    expect(store.list("projects")).toEqual([]);
    expect(store.get("tasks", task)).toMatchObject({ area_uuid: work });
    expect(store.get("tasks", task)).not.toHaveProperty("project_uuid");

    await history.undo();
    const [restored] = store.list("projects");
    expect(store.get("tasks", task)?.project_uuid).toBe(restored?.uuid);
    expect(store.get("tasks", task)).not.toHaveProperty("area_uuid");
  });

  test("deleting an area keeps its projects and to-dos", async () => {
    const { store, actions } = setup();
    const area = await actions.createArea({ title: "Home" });
    const project = await actions.createProject({ title: "Move", area_uuid: area });
    const task = await actions.createTask({
      title: "Rent",
      position: 0,
      when: "anytime",
      area_uuid: area,
    });
    await actions.deleteArea(area);
    expect(store.list("areas")).toEqual([]);
    expect(store.get("projects", project)).not.toHaveProperty("area_uuid");
    expect(store.get("tasks", task)).not.toHaveProperty("area_uuid");
  });
});

describe("commands", () => {
  test("bindings match the right modifiers", () => {
    expect(matches("mod+k", key("k", { metaKey: true }), true)).toBe(true);
    expect(matches("mod+k", key("k", { ctrlKey: true }), false)).toBe(true);
    expect(matches("mod+k", key("k"), true)).toBe(false);
    expect(matches("t", key("T", { shiftKey: true }), true)).toBe(false);
    expect(matches("?", key("?", { shiftKey: true }), true)).toBe(true);
    expect(matches("mod+,", key(",", { metaKey: true, shiftKey: true }), true)).toBe(false);
    expect(matches("mod+shift+,", key(",", { metaKey: true, shiftKey: true }), true)).toBe(true);
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

describe("keybindings", () => {
  const run = () => {};

  test("overrides replace a command's keys; an empty list unbinds it", () => {
    const registry = new CommandRegistry();
    const ran: string[] = [];
    registry.register([
      { id: "new", title: "New", keys: ["mod+n"], run: () => ran.push("new") },
      { id: "today", title: "Today", keys: ["t"], run: () => ran.push("today") },
    ]);
    let emitted = 0;
    registry.subscribe(() => emitted++);
    registry.setBindings({ new: ["mod+shift+j"], today: [] });
    expect(emitted).toBe(1);
    // The same overrides again don't re-list.
    registry.setBindings({ new: ["mod+shift+j"], today: [] });
    expect(emitted).toBe(1);
    expect(registry.handle(key("n", { metaKey: true }), true)).toBe(false);
    expect(registry.handle(key("t"), true)).toBe(false);
    expect(registry.handle(key("J", { metaKey: true, shiftKey: true }), true)).toBe(true);
    expect(ran).toEqual(["new"]);
    const listed = registry.list();
    expect(listed.map(({ id, keys, defaultKeys }) => ({ id, keys, defaultKeys }))).toEqual([
      { id: "new", keys: ["mod+shift+j"], defaultKeys: ["mod+n"] },
      { id: "today", keys: [], defaultKeys: ["t"] },
    ]);
    expect(registry.keysFor("today")).toEqual([]);
    expect(registry.keysFor("missing")).toBeUndefined();
    registry.setBindings({});
    expect(registry.keysFor("new")).toEqual(["mod+n"]);
  });

  test("an override applies to a command registered later, and outlives it", () => {
    const registry = new CommandRegistry();
    registry.setBindings({ zoom: ["mod+="] });
    expect(registry.keysFor("zoom")).toEqual(["mod+="]);
    const off = registry.register([{ id: "zoom", title: "Zoom", keys: ["mod+shift+."], run }]);
    expect(registry.list()[0]?.keys).toEqual(["mod+="]);
    off();
    expect(registry.keysFor("zoom")).toEqual(["mod+="]);
  });

  test("bindingFor names a key press, and round-trips with matches", () => {
    expect(bindingFor(key("K", { metaKey: true, shiftKey: true }), true)).toBe("mod+shift+k");
    expect(bindingFor(key("k", { ctrlKey: true, altKey: true }), true)).toBe("ctrl+alt+k");
    expect(bindingFor(key("k", { ctrlKey: true }), false)).toBe("mod+k");
    expect(bindingFor(key("?", { shiftKey: true }), true)).toBe("?");
    expect(bindingFor(key(" "), true)).toBe("space");
    expect(bindingFor(key("+", { metaKey: true, shiftKey: true }), true)).toBe("mod+plus");
    expect(bindingFor(key("ArrowUp", { shiftKey: true }), true)).toBe("shift+arrowup");
    expect(bindingFor(key(",", { metaKey: true, shiftKey: true }), true)).toBe("mod+shift+,");
    expect(bindingFor(key("Shift", { shiftKey: true }), true)).toBeNull();
    expect(bindingFor(key("Meta", { metaKey: true }), true)).toBeNull();
    const presses = [
      key("K", { metaKey: true, shiftKey: true }),
      key("?", { shiftKey: true }),
      key("t", { altKey: true }),
      key(" "),
      key("+", { metaKey: true }),
      key("Enter", { ctrlKey: true }),
      key("Backspace", { metaKey: true }),
      key(".", { metaKey: true, shiftKey: true }),
      key("!", { shiftKey: true }),
    ];
    for (const press of presses) {
      const binding = bindingFor(press, true);
      expect(binding).not.toBeNull();
      expect(matches(binding ?? "", press, true)).toBe(true);
    }
  });

  test("two spellings of one binding normalize to the same string", () => {
    expect(normalizeBinding("Shift+Mod+K")).toBe("mod+shift+k");
    expect(normalizeBinding("shift+?")).toBe("?");
    expect(normalizeBinding("left")).toBe("arrowleft");
    expect(normalizeBinding(" ")).toBe("space");
    expect(normalizeBinding("esc")).toBe("escape");
    expect(sameKeys(["mod+K", "esc"], ["mod+k", "escape"])).toBe(true);
    expect(sameKeys(["esc", "mod+k"], ["mod+k", "escape"])).toBe(false);
  });

  test("withKeys stores only real changes", () => {
    expect(withKeys({}, "new", ["Mod+N"], ["mod+n"])).toEqual({});
    expect(withKeys({ new: ["mod+j"] }, "new", ["mod+n"], ["mod+n"])).toEqual({});
    expect(withKeys({ other: [] }, "new", ["Shift+Mod+J"], ["mod+n"])).toEqual({
      other: [],
      new: ["mod+shift+j"],
    });
    expect(withKeys({}, "new", [], ["mod+n"])).toEqual({ new: [] });
  });

  test("commandsUsing finds the other commands bound to a key", () => {
    const commands = [
      { id: "a", keys: ["mod+k"] },
      { id: "b", keys: ["enter", "Mod+K"] },
      { id: "c", keys: ["t"] },
      { id: "d" },
    ];
    expect(commandsUsing(commands, "mod+k", "a").map((command) => command.id)).toEqual(["b"]);
    expect(commandsUsing(commands, "x")).toEqual([]);
  });

  test("shortcut search matches names, and keys typed as symbols or words", () => {
    const commands = [
      { id: "new", title: "New To-Do", group: "To-Do", keys: ["mod+n"], run },
      { id: "quick", title: "Quick Entry", group: "To-Do", keys: ["mod+shift+n"], run },
      { id: "next", title: "Next", group: "Navigate", keys: ["arrowright"], run },
      { id: "left", title: "Today, Left-Aligned", group: "Navigate", keys: ["alt+t"], run },
    ];
    const ids = (text: string) => searchShortcuts(commands, text, true).map(({ id }) => id);
    expect(ids("new")).toEqual(["new"]);
    expect(ids("navigate")).toEqual(["next", "left"]);
    expect(ids("⌘N")).toEqual(["new", "quick"]);
    expect(ids("cmd n")).toEqual(["new", "quick"]);
    expect(ids("⇧⌘N")).toEqual(["quick"]);
    expect(ids("opt t")).toEqual(["left"]);
    expect(ids("→")).toEqual(["next"]);
    expect(ids("")).toEqual(["new", "quick", "next", "left"]);
  });
});
