import type { ExternalEvent } from "@cal/calendar-source";
import {
  addDays,
  byPosition,
  type DayKey,
  inList,
  isOpen,
  isThisEvening,
  type Project,
  remainingMinutes,
  type SmartList,
  startDay,
  type Task,
  type TimeBlock,
  type WorkingHours,
  weekday,
} from "@cal/domain";
import { rowsOf } from "../../lib/lists";
import { formatDuration } from "../../lib/time";
import type { ListId } from "../../lib/ui";
import { zonedInstant } from "../../lib/zones";

/*
 * What the day headers of the days view report about each day (PLAN §5.3): the to-dos
 * set for it that have no time on the grid yet, the deadlines falling on it, and how
 * full its working hours are. Days are the grid's days: wall-clock days in `zone`, with
 * `gridToday` as today, so travelling to another zone moves everything with the grid.
 */

const MINUTE = 60_000;

// The Today list's to-dos in its order, This Evening last.
function todayRows(tasks: readonly Task[], gridToday: DayKey) {
  const rows = rowsOf("today", tasks, gridToday);
  const evening = rows.filter((task) => isThisEvening(task, gridToday));
  return [...rows.filter((task) => !evening.includes(task)), ...evening];
}

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
    const from = zonedInstant(day, 0, zone).getTime();
    const to = zonedInstant(addDays(day, 1), 0, zone).getTime();
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

export interface Deadlines {
  tasks: Task[];
  projects: Project[];
}

// Open to-dos and open projects whose deadline is each of `days`.
export function deadlinesByDay(
  days: readonly DayKey[],
  tasks: readonly Task[],
  projects: readonly Project[],
) {
  const byDay = new Map<DayKey, Deadlines>();
  for (const day of days) {
    byDay.set(day, {
      tasks: tasks.filter((task) => isOpen(task) && task.deadline === day).sort(byPosition),
      projects: projects
        .filter(
          (project) =>
            project.deadline === day &&
            project.completed_at === undefined &&
            project.canceled_at === undefined,
        )
        .sort(byPosition),
    });
  }
  return byDay;
}

// The list a to-do shows in when it isn't in `current`: the smart list holding it,
// else its project or area.
export function listShowing(
  task: Task,
  current: ListId,
  tasks: readonly Task[],
  today: DayKey,
): ListId {
  if (rowsOf(current, tasks, today).some((each) => each.uuid === task.uuid)) return current;
  const smart: SmartList[] = ["today", "upcoming", "inbox", "anytime", "someday"];
  const list = smart.find((each) => inList(task, each, today));
  if (list) return list;
  if (task.project_uuid) return `project:${task.project_uuid}`;
  if (task.area_uuid) return `area:${task.area_uuid}`;
  return "anytime";
}

/** A day's load in minutes. `capacity` is 0 on days the grid shades as off (weekends). */
export interface Workload {
  // Timed events inside working hours, overlaps merged.
  meetings: number;
  // Not-done blocks of open to-dos on the day.
  blocks: number;
  // Estimates still unscheduled for the day's to-dos without a block.
  todos: number;
  capacity: number;
}

export interface WorkloadInput {
  events: readonly ExternalEvent[];
  blocks: readonly TimeBlock[];
  tasks: readonly Task[];
  // The day's to-dos without a block (see unscheduledByDay).
  unscheduled: readonly Task[];
  hours: WorkingHours;
  // Calendars whose events never count as busy.
  freeCalendars: readonly string[];
  zone: string;
  now: Date;
}

// Total minutes covered by `spans` ([start, end) in ms), counting overlaps once.
function coveredMinutes(spans: { start: number; end: number }[]) {
  let total = 0;
  let reach = Number.NEGATIVE_INFINITY;
  for (const { start, end } of spans.sort((a, b) => a.start - b.start)) {
    const from = Math.max(start, reach);
    if (end > from) total += end - from;
    reach = Math.max(reach, end);
  }
  return Math.round(total / MINUTE);
}

/**
 * Meetings, planned work and capacity for `day`. Weekends have no working hours on the
 * grid, so they have no capacity and no meetings; their planned work still counts.
 */
export function workloadOn(day: DayKey, input: WorkloadInput): Workload {
  const { events, blocks, tasks, unscheduled, hours, freeCalendars, zone, now } = input;
  const working = weekday(day) !== 0 && weekday(day) !== 6;
  const workFrom = zonedInstant(day, hours.start, zone).getTime();
  const workTo = zonedInstant(day, hours.end, zone).getTime();
  const meetings = working
    ? coveredMinutes(
        events
          .filter(
            (event) =>
              !event.allDay &&
              event.busy &&
              event.myStatus !== "declined" &&
              !freeCalendars.includes(event.calendarId),
          )
          .map((event) => ({
            start: Math.max(workFrom, Date.parse(event.start)),
            end: Math.min(workTo, Date.parse(event.end)),
          })),
      )
    : 0;

  const dayFrom = zonedInstant(day, 0, zone).getTime();
  const dayTo = zonedInstant(addDays(day, 1), 0, zone).getTime();
  const open = new Set(tasks.filter(isOpen).map((task) => task.uuid));
  const planned = blocks
    .filter((block) => block.done_at === undefined && open.has(block.task_uuid ?? ""))
    .reduce((total, block) => {
      const start = Math.max(dayFrom, Date.parse(block.start_at));
      const end = Math.min(dayTo, Date.parse(block.end_at));
      return end > start ? total + Math.round((end - start) / MINUTE) : total;
    }, 0);
  const todos = unscheduled.reduce(
    (total, task) => total + (remainingMinutes(task, blocks, now) ?? 0),
    0,
  );
  return {
    meetings,
    blocks: planned,
    todos,
    capacity: working ? hours.end - hours.start : 0,
  };
}

export const plannedMinutes = (load: Workload) => load.blocks + load.todos;

// Minutes past capacity; a day without working hours is never "over".
export const overMinutes = (load: Workload) =>
  load.capacity === 0 ? 0 : Math.max(0, load.meetings + plannedMinutes(load) - load.capacity);

/**
 * The label beside the bar: "3h meetings · 3h planned", or "over by 1h". `short` drops
 * the words when both parts show ("3h · 3h"), for columns too narrow for the long form.
 */
export function workloadLabel(load: Workload, short = false) {
  const over = overMinutes(load);
  if (over > 0) return `over by ${formatDuration(over)}`;
  const planned = plannedMinutes(load);
  if (short && load.meetings > 0 && planned > 0)
    return `${formatDuration(load.meetings)} · ${formatDuration(planned)}`;
  return [
    load.meetings > 0 && `${formatDuration(load.meetings)} meetings`,
    planned > 0 && `${formatDuration(planned)} planned`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// The full breakdown for the row's tooltip.
export function workloadDetail(load: Workload) {
  const planned = plannedMinutes(load);
  const parts = [
    `Meetings ${formatDuration(load.meetings)}`,
    `Planned ${formatDuration(planned)} (blocks ${formatDuration(load.blocks)}, unscheduled to-dos ${formatDuration(load.todos)})`,
  ];
  if (load.capacity === 0) return [...parts, "No working hours"].join("\n");
  const over = overMinutes(load);
  const free = load.capacity - load.meetings - planned;
  return [
    ...parts,
    `Working hours ${formatDuration(load.capacity)}`,
    over > 0 ? `Over by ${formatDuration(over)}` : `Free ${formatDuration(free)}`,
  ].join("\n");
}
