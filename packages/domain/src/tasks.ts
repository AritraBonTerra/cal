import type { SyncedRow } from "@cal/backend/sync";
import type { DayKey } from "./dates";

export type Area = SyncedRow<"areas">;
export type Project = SyncedRow<"projects">;
export type Task = SyncedRow<"tasks">;
export type TimeBlock = SyncedRow<"time_blocks">;
export type Habit = SyncedRow<"habits">;
export type HabitEntry = SyncedRow<"habit_entries">;

// Things-style smart lists. Each is a filter over a task's dates and completion.
export type SmartList = "inbox" | "today" | "upcoming" | "anytime" | "someday" | "logbook";

export const isOpen = (task: Task) =>
  task.completed_at === undefined && task.canceled_at === undefined;

// A task's start day, when it has one ("When" is a date, or a date's evening).
export const startDay = (task: Task) =>
  task.when === "date" || task.when === "evening" ? task.when_date : undefined;

/**
 * Whether `task` belongs in `list` on day `today`. A start date is never overdue: a
 * task whose start day has passed simply stays in Today. Only deadlines turn red, and a
 * deadline today or earlier also pulls the task into Today.
 */
export function inList(task: Task, list: SmartList, today: DayKey): boolean {
  if (list === "logbook") return !isOpen(task);
  if (!isOpen(task)) return false;
  const start = startDay(task);
  const dueNow = task.deadline !== undefined && task.deadline <= today;
  switch (list) {
    case "inbox":
      return task.when === "inbox";
    case "today":
      return (start !== undefined && start <= today) || dueNow;
    case "upcoming":
      return start !== undefined && start > today && !dueNow;
    case "anytime":
      return task.when === "anytime" || inList(task, "today", today);
    case "someday":
      return task.when === "someday";
  }
}

// In Today, tasks set for "this evening" go in a separate section at the bottom.
export const isThisEvening = (task: Task, today: DayKey) =>
  task.when === "evening" && startDay(task) !== undefined && (startDay(task) ?? "") <= today;

export const isOverdue = (task: Task, today: DayKey) =>
  isOpen(task) && task.deadline !== undefined && task.deadline < today;

// Manual order first, then oldest first, so the order is stable across devices.
export const byPosition = <T extends { position: number; created_at: number; uuid: string }>(
  a: T,
  b: T,
) => a.position - b.position || a.created_at - b.created_at || a.uuid.localeCompare(b.uuid);

export const blockMinutes = (block: TimeBlock) =>
  Math.max(0, Math.round((Date.parse(block.end_at) - Date.parse(block.start_at)) / 60_000));

/**
 * How much of a task's estimate is on the calendar. Done blocks and blocks still ahead
 * count; past blocks never marked done don't, since that time wasn't spent on it.
 */
export function scheduledMinutes(task: Task, blocks: readonly TimeBlock[], now: Date) {
  return blocks
    .filter((block) => block.task_uuid === task.uuid)
    .filter((block) => block.done_at !== undefined || Date.parse(block.end_at) > now.getTime())
    .reduce((total, block) => total + blockMinutes(block), 0);
}

// Minutes still to schedule, or undefined when the task has no estimate.
export const remainingMinutes = (task: Task, blocks: readonly TimeBlock[], now: Date) =>
  task.estimate_min === undefined
    ? undefined
    : Math.max(0, task.estimate_min - scheduledMinutes(task, blocks, now));

// The length of a new block when a task is dropped on the calendar.
export const dropLengthMinutes = (task: Task, blocks: readonly TimeBlock[], now: Date) =>
  remainingMinutes(task, blocks, now) || 30;
