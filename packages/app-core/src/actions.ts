import {
  type DayKey,
  dropLengthMinutes,
  type HabitEntry,
  type Interval,
  localTimeZone,
  nextFreeSlot,
  type Task,
  type TimeBlock,
  toOffsetIso,
} from "@cal/domain";
import type { TaskEntry } from "@cal/nlp";
import type { NewRow, RowPatch } from "@cal/sync";
import type { History, Writer } from "./history";

/**
 * The to-do fields a Quick Entry parse names, for a new to-do or one being updated.
 * Fields the text didn't name are absent, so they keep the list's or the to-do's values.
 */
export function entryFields(entry: TaskEntry): Partial<NewRow<"tasks">> {
  return {
    ...(entry.when && { when: entry.when, when_date: entry.when_date }),
    ...(entry.deadline && { deadline: entry.deadline }),
    ...(entry.estimate_min !== undefined && { estimate_min: entry.estimate_min }),
    ...(entry.priority !== undefined && { priority: entry.priority }),
    ...(entry.project_uuid && { project_uuid: entry.project_uuid }),
    ...(entry.tags?.length && { tags: entry.tags.join(",") }),
    ...(entry.reminder_at && { reminder_at: entry.reminder_at }),
    ...(entry.rrule && {
      recurrence_rule: entry.rrule,
      recurrence_mode: entry.repeat === "after_completion" ? "after_completion" : "fixed",
    }),
  };
}

// Places the block a parse with a time asks for: `minutes` long (the to-do's estimate),
// else 30.
async function placeEntryBlock(
  tx: Writer,
  taskUuid: string,
  entry: TaskEntry,
  minutes: number | undefined,
) {
  if (!entry.start_at) return;
  const start = new Date(entry.start_at);
  const end = new Date(start.getTime() + (minutes ?? 30) * 60_000);
  await tx.insert("time_blocks", {
    task_uuid: taskUuid,
    start_at: toOffsetIso(start),
    end_at: toOffsetIso(end),
    time_zone: localTimeZone(),
    source: "manual",
  });
}

/**
 * Everything the UI can change, each as one undoable step. Views call these rather than
 * writing tables, so cascades (a task's blocks) and completion rules live in one place.
 */
export function createActions(history: History, now: () => Date = () => new Date()) {
  const { source } = history;
  const stamp = () => now().getTime();
  const blocksOf = async (taskUuid: string) =>
    (await source.list("time_blocks")).filter((block) => block.task_uuid === taskUuid);
  // One past the highest position in `table`, so a new row lands at the end of its list.
  const endOf = async (table: "projects" | "areas" | "habits") =>
    (await source.list(table)).reduce((last, row) => Math.max(last, row.position + 1), 0);

  return {
    createTask: (task: NewRow<"tasks">) =>
      history.transact("New To-Do", (tx) => tx.insert("tasks", task)),

    /**
     * Adds a to-do from a Quick Entry parse, over the defaults of the list it was typed
     * in (a typed When replaces the list's day), plus a block when a time was given.
     */
    createFromEntry: (entry: TaskEntry, defaults: Partial<NewRow<"tasks">> = {}) =>
      history.transact("New To-Do", async (tx) => {
        const uuid = await tx.insert("tasks", {
          position: -1,
          when: "inbox",
          ...defaults,
          ...entryFields(entry),
          title: entry.title,
        });
        await placeEntryBlock(tx, uuid, entry, entry.estimate_min ?? defaults.estimate_min);
        return uuid;
      }),

    /**
     * Applies a parse to an existing to-do (a new to-do's card, as it closes): the clean
     * title and the fields the text names, plus a block when a time was given, as one
     * step. Fields the text didn't name keep their values; `extra` rides along (notes).
     * Where the text and a chip set by hand name the same field, the text wins: it was
     * typed in the same card, so it is the latest word on it.
     */
    applyEntry: (uuid: string, entry: TaskEntry, extra: RowPatch<"tasks"> = {}) =>
      history.transact("Edit To-Do", async (tx) => {
        const id = tx.resolve(uuid);
        const task = await source.get("tasks", id);
        if (!task) return false;
        await tx.update("tasks", id, {
          ...extra,
          ...entryFields(entry),
          // An undated When (someday, anytime) clears the day the list gave it, and a
          // typed project takes the to-do out of its area, as the Project chip does.
          ...(entry.when && { when_date: entry.when_date ?? null }),
          ...(entry.project_uuid && { area_uuid: null }),
          title: entry.title,
        });
        await placeEntryBlock(tx, id, entry, entry.estimate_min ?? task.estimate_min);
        return true;
      }),

    updateTask: (uuid: string, patch: RowPatch<"tasks">, label = "Edit To-Do") =>
      history.transact(label, (tx) => tx.update("tasks", uuid, patch)),

    // Checks a task off (or back on). Its blocks stay on the calendar as history.
    setTaskDone: (uuid: string, done: boolean) =>
      history.transact(done ? "Complete To-Do" : "Reopen To-Do", (tx) =>
        tx.update("tasks", uuid, { completed_at: done ? stamp() : null, canceled_at: null }),
      ),

    // Deletes a task and its time blocks. Deleting a block never deletes its task.
    deleteTask: (uuid: string) =>
      history.transact("Delete To-Do", async (tx) => {
        const id = tx.resolve(uuid);
        for (const block of await blocksOf(id)) await tx.remove("time_blocks", block.uuid);
        return tx.remove("tasks", id);
      }),

    // Sets When: a day (optionally this evening), or one of the undated lists.
    setWhen: (uuid: string, when: Task["when"], day?: DayKey) =>
      history.transact("Set When", (tx) =>
        tx.update("tasks", uuid, {
          when,
          when_date: when === "date" || when === "evening" ? day : null,
        }),
      ),

    // Places a block for a task (dragged from the sidebar, or `X`).
    scheduleTask: (taskUuid: string, start: Date, end: Date) =>
      history.transact("Schedule To-Do", (tx) =>
        tx.insert("time_blocks", {
          task_uuid: taskUuid,
          start_at: toOffsetIso(start),
          end_at: toOffsetIso(end),
          time_zone: localTimeZone(),
          source: "manual",
        }),
      ),

    /**
     * Places a task in the next free slot today (`X`, or Schedule on iOS), around `busy`
     * (the device's events) and every block, including ones running in from yesterday.
     * The slot is chosen inside the history queue, so quick repeats see each other's
     * blocks. Resolves false when the working day is full.
     */
    scheduleNext: (taskUuid: string, busy: readonly Interval[]) =>
      history.transact("Schedule To-Do", async (tx) => {
        const task = await source.get("tasks", tx.resolve(taskUuid));
        if (!task) return false;
        const at = now();
        const blocks = await source.list("time_blocks");
        const taken = [
          ...busy,
          ...blocks.map((block) => ({
            start: new Date(block.start_at),
            end: new Date(block.end_at),
          })),
        ];
        const slot = nextFreeSlot(taken, at, dropLengthMinutes(task, blocks, at));
        if (!slot) return false;
        await tx.insert("time_blocks", {
          task_uuid: task.uuid,
          start_at: toOffsetIso(slot.start),
          end_at: toOffsetIso(slot.end),
          time_zone: localTimeZone(),
          source: "manual",
        });
        return true;
      }),

    // Moves or resizes a block. A block the user moved is pinned against the scheduler.
    moveBlock: (uuid: string, start: Date, end: Date) =>
      history.transact("Move Block", (tx) =>
        tx.update("time_blocks", uuid, {
          start_at: toOffsetIso(start),
          end_at: toOffsetIso(end),
          time_zone: localTimeZone(),
          pinned_at: stamp(),
        }),
      ),

    deleteBlock: (uuid: string) =>
      history.transact("Remove Block", (tx) => tx.remove("time_blocks", uuid)),

    /**
     * Checks a block's box. With `session` only that block is marked done ("Done for
     * this session"); otherwise the task is completed too, along with the block.
     */
    setBlockDone: (block: TimeBlock, done: boolean, session = false) =>
      history.transact(done ? "Complete Block" : "Reopen Block", async (tx) => {
        await tx.update("time_blocks", block.uuid, { done_at: done ? stamp() : null });
        if (!session && block.task_uuid) {
          await tx.update("tasks", block.task_uuid, { completed_at: done ? stamp() : null });
        }
      }),

    // Adds a project at the end of the list, inside `area_uuid` when given.
    createProject: (project: Omit<NewRow<"projects">, "position">) =>
      history.transact("New Project", async (tx) =>
        tx.insert("projects", { ...project, position: await endOf("projects") }),
      ),

    updateProject: (uuid: string, patch: RowPatch<"projects">, label = "Edit Project") =>
      history.transact(label, (tx) => tx.update("projects", uuid, patch)),

    // Deletes a project. Its to-dos stay: they move out of it, into its area if it had one.
    deleteProject: (uuid: string) =>
      history.transact("Delete Project", async (tx) => {
        const id = tx.resolve(uuid);
        const project = await source.get("projects", id);
        if (!project) return false;
        for (const task of await source.list("tasks")) {
          if (task.project_uuid !== id) continue;
          await tx.update("tasks", task.uuid, {
            project_uuid: null,
            area_uuid: task.area_uuid ?? project.area_uuid ?? null,
          });
        }
        return tx.remove("projects", id);
      }),

    // Adds an area at the end of the list.
    createArea: (area: Omit<NewRow<"areas">, "position">) =>
      history.transact("New Area", async (tx) =>
        tx.insert("areas", { ...area, position: await endOf("areas") }),
      ),

    updateArea: (uuid: string, patch: RowPatch<"areas">, label = "Edit Area") =>
      history.transact(label, (tx) => tx.update("areas", uuid, patch)),

    // Deletes an area. Its projects and to-dos stay, outside any area.
    deleteArea: (uuid: string) =>
      history.transact("Delete Area", async (tx) => {
        const id = tx.resolve(uuid);
        for (const project of await source.list("projects")) {
          if (project.area_uuid === id)
            await tx.update("projects", project.uuid, { area_uuid: null });
        }
        for (const task of await source.list("tasks")) {
          if (task.area_uuid === id) await tx.update("tasks", task.uuid, { area_uuid: null });
        }
        return tx.remove("areas", id);
      }),

    // Adds a habit at the end of the list.
    createHabit: (habit: Omit<NewRow<"habits">, "position">) =>
      history.transact("New Habit", async (tx) =>
        tx.insert("habits", { ...habit, position: await endOf("habits") }),
      ),

    updateHabit: (uuid: string, patch: RowPatch<"habits">, label = "Edit Habit") =>
      history.transact(label, (tx) => tx.update("habits", uuid, patch)),

    // Logs a habit for a day, replacing that day's value; a value of 0 unchecks it.
    logHabit: (
      habitUuid: string,
      date: DayKey,
      value: number,
      entrySource: HabitEntry["source"] = "manual",
    ) =>
      history.transact(value ? "Log Habit" : "Uncheck Habit", async (tx) => {
        const habit = tx.resolve(habitUuid);
        const entries = (await source.list("habit_entries")).filter(
          (entry) => entry.habit_uuid === habit && entry.date === date,
        );
        for (const entry of entries) await tx.remove("habit_entries", entry.uuid);
        if (value) {
          await tx.insert("habit_entries", {
            habit_uuid: habitUuid,
            date,
            value,
            source: entrySource,
          });
        }
      }),
  };
}

export type Actions = ReturnType<typeof createActions>;
