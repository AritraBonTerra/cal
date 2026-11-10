import {
  type Area,
  addDays,
  byPosition,
  type DayKey,
  inList,
  isOpen,
  isThisEvening,
  type Project,
  type SmartList,
  startOfMonth,
  type Task,
  type TimeBlock,
} from "@cal/domain";
import type { NewRow, RowPatch } from "@cal/sync";
import type { ListId } from "./ui";
import { zonedDayKey } from "./zones";

/*
 * What each sidebar entry shows: smart lists are filters over dates and completion;
 * a project or area lists its open tasks. Both the to-do pane and the keyboard
 * commands read the same ordering, so ↑/↓ follow what's on screen.
 */

export const SMART_LISTS: readonly SmartList[] = [
  "inbox",
  "today",
  "upcoming",
  "anytime",
  "someday",
  "logbook",
];

export const SMART_TITLES: Record<SmartList, string> = {
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  anytime: "Anytime",
  someday: "Someday",
  logbook: "Logbook",
};

export const isSmartList = (list: ListId): list is SmartList =>
  (SMART_LISTS as readonly string[]).includes(list);

// The tables a list is drawn from (the app's `data` fits).
export interface ListData {
  tasks: readonly Task[];
  blocks: readonly TimeBlock[];
  projects: readonly Project[];
  areas: readonly Area[];
}

/*
 * When a list is drawn: `today` is the Mac's (what counts as Today), while `gridToday`
 * and `zone` are the grid's, which decide what "scheduled today" means and what time a
 * block shows.
 */
export interface ListTime {
  today: DayKey;
  gridToday: DayKey;
  zone: string;
  now: Date;
}

/*
 * A list as the pane draws it: sections in order, each with its rows. A "plain" section
 * has no heading. Today splits into Scheduled (with each row's next block today, in
 * time order), Not scheduled and This Evening once anything is scheduled. Upcoming
 * groups by day for the next week, then by month; Anytime puts loose to-dos first,
 * then one section per project.
 */
export type Section =
  | { kind: "plain"; rows: Task[] }
  | { kind: "scheduled"; rows: Task[]; next: ReadonlyMap<string, TimeBlock> }
  | { kind: "unscheduled"; rows: Task[] }
  | { kind: "evening"; rows: Task[] }
  | { kind: "day"; day: DayKey; rows: Task[] }
  // `month` is the month's first day.
  | { kind: "month"; month: DayKey; rows: Task[] }
  | { kind: "project"; project: Project; rows: Task[] };

// Days of Upcoming that get a section each, from tomorrow; later to-dos group by month.
export const UPCOMING_DAYS = 7;

// A stable React key for a section.
export function sectionKey(section: Section) {
  switch (section.kind) {
    case "day":
      return `day:${section.day}`;
    case "month":
      return `month:${section.month}`;
    case "project":
      return `project:${section.project.uuid}`;
    default:
      return section.kind;
  }
}

// A task's next block that isn't done and hasn't ended (it may be running now).
export function nextBlock(task: Task, blocks: readonly TimeBlock[], now: Date) {
  let next: TimeBlock | undefined;
  for (const block of blocks) {
    if (block.task_uuid !== task.uuid || block.done_at !== undefined) continue;
    if (Date.parse(block.end_at) <= now.getTime()) continue;
    if (!next || Date.parse(block.start_at) < Date.parse(next.start_at)) next = block;
  }
  return next;
}

// Open tasks of `list` before grouping, in its base order.
export function rowsOf(list: ListId, tasks: readonly Task[], today: DayKey) {
  let rows: Task[];
  if (isSmartList(list)) rows = tasks.filter((task) => inList(task, list, today));
  else if (list.startsWith("project:")) {
    const uuid = list.slice("project:".length);
    rows = tasks.filter((task) => isOpen(task) && task.project_uuid === uuid);
  } else {
    const uuid = list.slice("area:".length);
    rows = tasks.filter((task) => isOpen(task) && task.area_uuid === uuid);
  }
  if (list === "logbook") {
    return rows.sort(
      (a, b) => (b.completed_at ?? b.canceled_at ?? 0) - (a.completed_at ?? a.canceled_at ?? 0),
    );
  }
  if (list === "upcoming") {
    return rows.sort(
      (a, b) => (a.when_date ?? "").localeCompare(b.when_date ?? "") || byPosition(a, b),
    );
  }
  return rows.sort(byPosition);
}

// Today: Scheduled, Not scheduled, This Evening; without anything scheduled, the plain
// list and This Evening, as before scheduling existed.
function todaySections(rows: Task[], blocks: readonly TimeBlock[], at: ListTime): Section[] {
  const next = new Map<string, TimeBlock>();
  for (const task of rows) {
    const block = nextBlock(task, blocks, at.now);
    // A block that began before today and runs into it counts as today's too.
    if (block && zonedDayKey(new Date(block.start_at), at.zone) <= at.gridToday) {
      next.set(task.uuid, block);
    }
  }
  const start = (task: Task) => Date.parse(next.get(task.uuid)?.start_at ?? "");
  const scheduled = rows
    .filter((task) => next.has(task.uuid))
    .sort((a, b) => start(a) - start(b) || byPosition(a, b));
  const rest = rows.filter((task) => !next.has(task.uuid));
  const day = rest.filter((task) => !isThisEvening(task, at.today));
  const evening = rest.filter((task) => isThisEvening(task, at.today));
  if (scheduled.length === 0) {
    return [
      { kind: "plain", rows: day },
      { kind: "evening", rows: evening },
    ];
  }
  return [
    { kind: "scheduled", rows: scheduled, next },
    { kind: "unscheduled", rows: day },
    { kind: "evening", rows: evening },
  ];
}

// Upcoming, already in day order: a section per day through the next week, then per month.
function upcomingSections(rows: Task[], today: DayKey) {
  const last = addDays(today, UPCOMING_DAYS);
  const sections: Section[] = [];
  for (const task of rows) {
    const day = task.when_date ?? today;
    const current = sections.at(-1);
    if (day <= last) {
      if (current?.kind === "day" && current.day === day) current.rows.push(task);
      else sections.push({ kind: "day", day, rows: [task] });
    } else {
      const month = startOfMonth(day);
      if (current?.kind === "month" && current.month === month) current.rows.push(task);
      else sections.push({ kind: "month", month, rows: [task] });
    }
  }
  return sections;
}

// Anytime: to-dos outside any project, then each project's, ordered by area (projects
// without one first) and then by the project's position.
function anytimeSections(rows: Task[], data: ListData): Section[] {
  const area = new Map(data.areas.map((each) => [each.uuid, each]));
  const areaPosition = (project: Project) =>
    area.get(project.area_uuid ?? "")?.position ?? Number.NEGATIVE_INFINITY;
  const projects = [...data.projects].sort(
    (a, b) => areaPosition(a) - areaPosition(b) || byPosition(a, b),
  );
  const known = new Set(projects.map((project) => project.uuid));
  return [
    {
      kind: "plain",
      rows: rows.filter((task) => !task.project_uuid || !known.has(task.project_uuid)),
    },
    ...projects.map(
      (project): Section => ({
        kind: "project",
        project,
        rows: rows.filter((task) => task.project_uuid === project.uuid),
      }),
    ),
  ];
}

// The sections of `list` in display order. Empty sections are left out.
export function listSections(list: ListId, data: ListData, at: ListTime): Section[] {
  const rows = rowsOf(list, data.tasks, at.today);
  return group(list, rows, data, at).filter((section) => section.rows.length > 0);
}

function group(list: ListId, rows: Task[], data: ListData, at: ListTime): Section[] {
  switch (list) {
    case "today":
      return todaySections(rows, data.blocks, at);
    case "upcoming":
      return upcomingSections(rows, at.today);
    case "anytime":
      return anytimeSections(rows, data);
    default:
      return [{ kind: "plain", rows }];
  }
}

// Open tasks of `list` in display order: the rows of its sections, top to bottom.
export const tasksIn = (list: ListId, data: ListData, at: ListTime) =>
  listSections(list, data, at).flatMap((section) => section.rows);

// A list's title; a project or area still waiting for one reads "New Project" or "New Area".
export function listTitle(list: ListId, projects: readonly Project[], areas: readonly Area[]) {
  if (isSmartList(list)) return SMART_TITLES[list];
  const uuid = list.slice(list.indexOf(":") + 1);
  if (list.startsWith("project:")) {
    const project = projects.find((each) => each.uuid === uuid);
    return project ? project.title || "New Project" : "";
  }
  const area = areas.find((each) => each.uuid === uuid);
  return area ? area.title || "New Area" : "";
}

// Fields a task created inside `list` starts with, so ⌘N lands where you're looking.
export function newTaskIn(list: ListId, today: DayKey): Omit<NewRow<"tasks">, "title"> {
  const base = { position: -1 };
  switch (list) {
    case "today":
      return { ...base, when: "date", when_date: today };
    case "upcoming":
      // Tomorrow, the first day Upcoming shows, so the new row appears where you are.
      return { ...base, when: "date", when_date: addDays(today, 1) };
    case "anytime":
      return { ...base, when: "anytime" };
    case "someday":
      return { ...base, when: "someday" };
    case "inbox":
    case "logbook":
      return { ...base, when: "inbox" };
  }
  const uuid = list.slice(list.indexOf(":") + 1);
  return list.startsWith("project:")
    ? { ...base, when: "anytime", project_uuid: uuid }
    : { ...base, when: "anytime", area_uuid: uuid };
}

// The area a project made while `list` is showing goes into: that area, or the area of
// that project; none from a smart list or a project outside any area.
export function areaForNewProject(list: ListId, projects: readonly Project[]) {
  if (list.startsWith("area:")) return list.slice("area:".length);
  if (!list.startsWith("project:")) return undefined;
  const uuid = list.slice("project:".length);
  return projects.find((project) => project.uuid === uuid)?.area_uuid;
}

/**
 * The fields that move a to-do into a project or an area (the Move menu). A to-do holds
 * one or the other, and one leaving the Inbox this way goes to Anytime, as in Things.
 */
export function moveInto(task: Task, target: { project: string } | { area: string }) {
  const patch: RowPatch<"tasks"> =
    "project" in target
      ? { project_uuid: target.project, area_uuid: null }
      : { area_uuid: target.area, project_uuid: null };
  return task.when === "inbox" ? { ...patch, when: "anytime" as const } : patch;
}
