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
import type { History } from "./history";

/**
 * Everything the UI can change, each as one undoable step. Views call these rather than
 * writing tables, so cascades (a task's blocks) and completion rules live in one place.
 */
export function createActions(history: History, now: () => Date = () => new Date()) {
  const { source } = history;
  const stamp = () => now().getTime();
  const blocksOf = async (taskUuid: string) =>
    (await source.list("time_blocks")).filter((block) => block.task_uuid === taskUuid);

  return {
    createTask: (task: NewRow<"tasks">) =>
      history.transact("New To-Do", (tx) => tx.insert("tasks", task)),

    /**
     * Adds a to-do from a Quick Entry parse, over the defaults of the list it was typed
     * in (a typed When replaces the list's day), plus a block when a time was given.
     */
    createFromEntry: (entry: TaskEntry, defaults: Partial<NewRow<"tasks">> = {}) =>
      history.transact("New To-Do", async (tx) => {
        const typed: Partial<NewRow<"tasks">> = {
          ...(entry.when && { when: entry.when, when_date: entry.when_date }),
          ...(entry.deadline && { deadline: entry.deadline }),
          ...(entry.estimate_min !== undefined && { estimate_min: entry.estimate_min }),
          ...(entry.priority !== undefined && { priority: entry.priority }),
          ...(entry.project_uuid && { project_uuid: entry.project_uuid }),
          ...(entry.rrule && {
            recurrence_rule: entry.rrule,
            recurrence_mode: entry.repeat === "after_completion" ? "after_completion" : "fixed",
          }),
        };
        const uuid = await tx.insert("tasks", {
          position: -1,
          when: "inbox",
          ...defaults,
          ...typed,
          title: entry.title,
        });
        if (entry.start_at) {
          const start = new Date(entry.start_at);
          const end = new Date(start.getTime() + (entry.estimate_min ?? 30) * 60_000);
          await tx.insert("time_blocks", {
            task_uuid: uuid,
            start_at: toOffsetIso(start),
            end_at: toOffsetIso(end),
            time_zone: localTimeZone(),
            source: "manual",
          });
        }
        return uuid;
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

    createHabit: (habit: NewRow<"habits">) =>
      history.transact("New Habit", (tx) => tx.insert("habits", habit)),

    updateHabit: (uuid: string, patch: RowPatch<"habits">) =>
      history.transact("Edit Habit", (tx) => tx.update("habits", uuid, patch)),

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
