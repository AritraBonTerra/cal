import type { ExternalEvent } from "@cal/calendar-source";
import {
  addDays,
  byPosition,
  type DayKey,
  dayStatuses,
  type Habit,
  type HabitEntry,
  inList,
  isOpen,
  isThisEvening,
  type Project,
  startDay,
  type Task,
  type TimeBlock,
  toDayKey,
  zonedInstant,
} from "@cal/domain";

/*
 * The agenda: each day as one list of everything on it (device events, time blocks,
 * to-dos and habits), for the Mac's Agenda view and the iPhone's calendar. Days are
 * wall-clock days in `zone`, with `gridToday` as today.
 */

// Something at a time of day. Times are the item's own, so one running past midnight
// sits on both days with the same times.
export type TimedEntry =
  | { kind: "event"; key: string; event: ExternalEvent; start: Date; end: Date }
  | {
      kind: "block";
      key: string;
      block: TimeBlock;
      task?: Task;
      project?: Project;
      start: Date;
      end: Date;
    };

export interface AgendaDay {
  day: DayKey;
  allDay: ExternalEvent[];
  // Open to-dos for the day without a block on it.
  tasks: Task[];
  // Open to-dos due that day and not already in `tasks` or `timed`.
  due: Task[];
  // Today only: habits it's a day for, done ones included.
  habits: Habit[];
  timed: TimedEntry[];
}

export interface AgendaInput {
  events: readonly ExternalEvent[];
  blocks: readonly TimeBlock[];
  tasks: readonly Task[];
  projects: readonly Project[];
  habits: readonly Habit[];
  entries: readonly HabitEntry[];
  gridToday: DayKey;
  // Today on this device, which habits are logged against.
  today: DayKey;
  zone: string;
}

// The Today list's to-dos in its order, This Evening last.
function todayRows(tasks: readonly Task[], gridToday: DayKey) {
  const rows = tasks.filter((task) => inList(task, "today", gridToday)).sort(byPosition);
  const evening = rows.filter((task) => isThisEvening(task, gridToday));
  return [...rows.filter((task) => !evening.includes(task)), ...evening];
}

// The instants a day runs between in `zone`, in ms.
const boundsOf = (day: DayKey, zone: string) => ({
  from: zonedInstant(day, 0, zone),
  to: zonedInstant(addDays(day, 1), 0, zone),
});

/**
 * Open to-dos that belong on each of `days` and have no block that day, in list order.
 * Today's column holds the Today list (including to-dos whose date has passed); a later
 * day holds the to-dos dated for it that aren't already in Today. Past days hold none:
 * their to-dos have rolled into Today.
 */
export function unscheduledByDay(
  days: readonly DayKey[],
  tasks: readonly Task[],
  blocks: readonly TimeBlock[],
  gridToday: DayKey,
  zone: string,
) {
  const later = tasks
    .filter((task) => isOpen(task) && !inList(task, "today", gridToday))
    .sort(byPosition);
  const byDay = new Map<DayKey, Task[]>();
  for (const day of days) {
    if (day < gridToday) {
      byDay.set(day, []);
      continue;
    }
    const { from, to } = boundsOf(day, zone);
    const timed = new Set(
      blocks
        .filter((block) => Date.parse(block.end_at) > from && Date.parse(block.start_at) < to)
        .map((block) => block.task_uuid),
    );
    const belong =
      day === gridToday
        ? todayRows(tasks, gridToday)
        : later.filter((task) => startDay(task) === day);
    byDay.set(
      day,
      belong.filter((task) => !timed.has(task.uuid)),
    );
  }
  return byDay;
}

// The habits `today` is a day for: logged today, or still open.
function habitsFor(habits: readonly Habit[], entries: readonly HabitEntry[], today: DayKey) {
  return habits
    .filter((habit) => {
      if (habit.archived_at !== undefined) return false;
      const status = dayStatuses(habit, entries, today, today).get(today);
      return status === "done" || status === "open";
    })
    .sort(byPosition);
}

// What each of `days` holds, in day order; a day with nothing on it has empty lists.
export function agendaDays(days: readonly DayKey[], input: AgendaInput): AgendaDay[] {
  const { events, blocks, tasks, projects, habits, entries, gridToday, today, zone } = input;
  const todos = unscheduledByDay(days, tasks, blocks, gridToday, zone);
  const taskOf = new Map(tasks.map((task) => [task.uuid, task]));
  const projectOf = new Map(projects.map((project) => [project.uuid, project]));
  const timed: TimedEntry[] = [
    ...events
      .filter((event) => !event.allDay)
      .map(
        (event): TimedEntry => ({
          kind: "event",
          key: `event:${event.id}`,
          event,
          start: new Date(event.start),
          end: new Date(event.end),
        }),
      ),
    ...blocks.map((block): TimedEntry => {
      const task = taskOf.get(block.task_uuid ?? "");
      return {
        kind: "block",
        key: `block:${block.uuid}`,
        block,
        task,
        project: projectOf.get(task?.project_uuid ?? ""),
        start: new Date(block.start_at),
        end: new Date(block.end_at),
      };
    }),
  ].sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      a.end.getTime() - b.end.getTime() ||
      a.key.localeCompare(b.key),
  );
  const allDay = events
    .filter((event) => event.allDay)
    .map((event) => {
      const start = new Date(event.start);
      // All-day events span this device's midnights, the end exclusive.
      const last = new Date(Math.max(start.getTime(), Date.parse(event.end) - 1));
      return { event, first: toDayKey(start), last: toDayKey(last) };
    })
    .sort((a, b) => a.first.localeCompare(b.first) || a.event.title.localeCompare(b.event.title));

  return days.map((day) => {
    const { from, to } = boundsOf(day, zone);
    const onDay = timed.filter(
      ({ start, end }) =>
        start.getTime() < to &&
        // An entry of no length still belongs to the day it starts on.
        (end.getTime() > from || start.getTime() >= from),
    );
    const listed = new Set([
      ...(todos.get(day) ?? []).map((task) => task.uuid),
      ...onDay.flatMap((entry) => (entry.kind === "block" ? (entry.task?.uuid ?? []) : [])),
    ]);
    return {
      day,
      allDay: allDay
        .filter(({ first, last }) => first <= day && day <= last)
        .map(({ event }) => event),
      tasks: todos.get(day) ?? [],
      // A deadline that has passed is in Today, not on its day.
      due:
        day < gridToday
          ? []
          : tasks
              .filter((task) => isOpen(task) && task.deadline === day && !listed.has(task.uuid))
              .sort(byPosition),
      habits: day === today ? habitsFor(habits, entries, today) : [],
      timed: onDay,
    };
  });
}

// Whether a day holds nothing.
export const isEmptyDay = (day: AgendaDay) =>
  day.allDay.length + day.tasks.length + day.due.length + day.habits.length + day.timed.length ===
  0;
